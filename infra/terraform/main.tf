# Fit-scoring agent — AWS infrastructure.
#
# Apply order matters — see infra/RUNBOOK.md:
#   1. terraform apply -target=aws_budgets_budget.fit_scorer   (budget alert first, alone)
#   2. confirm the budget + the Anthropic Console spend cap are both live
#   3. terraform apply                                          (everything else)
#
# enable_weekly_schedules defaults to false — the EventBridge schedules are
# created but disabled until a manual on-demand smoke test has been
# reviewed. Flip it to true and re-apply when ready.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

locals {
  ssm_prefix = "/jobs-radar-qc/fit-scorer"
}

# ─── AWS Budget — apply this one first, on its own ─────────────────────────

resource "aws_budgets_budget" "fit_scorer" {
  name         = "${var.project_name}-budget"
  budget_type  = "COST"
  limit_amount = "1"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_email]
  }
}

# ─── ECR ────────────────────────────────────────────────────────────────────

resource "aws_ecr_repository" "fit_scorer" {
  name                 = var.project_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "fit_scorer" {
  repository = aws_ecr_repository.fit_scorer.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "keep last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}

# ─── CloudWatch Logs ────────────────────────────────────────────────────────
# Created explicitly with 14-day retention, rather than relying on Lambda's
# auto-created (never-expiring by default) log group.

resource "aws_cloudwatch_log_group" "fit_scorer" {
  name              = "/aws/lambda/${var.project_name}"
  retention_in_days = 14
}

# ─── SSM Parameter Store — secrets ─────────────────────────────────────────
# pending-batch-id (the weekly submit/poll handoff) is written, read, and
# deleted by the Lambda itself at runtime — Terraform only grants the IAM
# permission for it below, it doesn't manage the value.

resource "aws_ssm_parameter" "anthropic_api_key" {
  name  = "${local.ssm_prefix}/anthropic-api-key"
  type  = "SecureString"
  value = var.anthropic_api_key
}

resource "aws_ssm_parameter" "supabase_service_role_key" {
  name  = "${local.ssm_prefix}/supabase-service-role-key"
  type  = "SecureString"
  value = var.supabase_service_role_key
}

resource "aws_ssm_parameter" "supabase_db_url" {
  name  = "${local.ssm_prefix}/supabase-db-url"
  type  = "SecureString"
  value = var.supabase_db_url
}

# ─── IAM — Lambda execution role ───────────────────────────────────────────
# Least privilege: logs to its own log group, read-only on this project's
# SSM secrets, write/delete scoped to exactly the one batch-state parameter.

resource "aws_iam_role" "lambda_exec" {
  name = "${var.project_name}-lambda-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "lambda_exec" {
  name = "${var.project_name}-lambda-exec-policy"
  role = aws_iam_role.lambda_exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.fit_scorer.arn}:*"
      },
      {
        Sid      = "ReadSecrets"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}/*"
      },
      {
        Sid      = "BatchState"
        Effect   = "Allow"
        Action   = ["ssm:PutParameter", "ssm:DeleteParameter"]
        Resource = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}/pending-batch-id"
      }
    ]
  })
}

# ─── Lambda ─────────────────────────────────────────────────────────────────

resource "aws_lambda_function" "fit_scorer" {
  function_name = var.project_name
  role          = aws_iam_role.lambda_exec.arn
  package_type  = "Image"
  image_uri     = var.image_uri
  memory_size   = var.lambda_memory_mb
  timeout       = var.lambda_timeout_s

  environment {
    variables = {
      SUPABASE_URL      = var.supabase_url
      CORS_ALLOW_ORIGIN = var.cors_allow_origin
    }
  }

  depends_on = [aws_cloudwatch_log_group.fit_scorer]
}

resource "aws_lambda_function_url" "fit_scorer" {
  function_name      = aws_lambda_function.fit_scorer.function_name
  authorization_type = "NONE" # public, no-account-required per Phase 4's /matches design

  cors {
    allow_origins = [var.cors_allow_origin]
    allow_methods = ["POST"]
    allow_headers = ["content-type"]
  }
}

# ─── EventBridge Scheduler — weekly batch path ─────────────────────────────

resource "aws_iam_role" "scheduler_invoke" {
  name = "${var.project_name}-scheduler-invoke"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name = "${var.project_name}-scheduler-invoke-policy"
  role = aws_iam_role.scheduler_invoke.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.fit_scorer.arn
    }]
  })
}

resource "aws_scheduler_schedule" "weekly_submit" {
  name                = "${var.project_name}-weekly-submit"
  schedule_expression = "cron(0 1 ? * SUN *)" # Sunday 01:00 UTC
  state               = var.enable_weekly_schedules ? "ENABLED" : "DISABLED"

  flexible_time_window { mode = "OFF" }

  target {
    arn      = aws_lambda_function.fit_scorer.arn
    role_arn = aws_iam_role.scheduler_invoke.arn
    input    = jsonencode({ trigger = "weekly-submit" })
  }
}

resource "aws_scheduler_schedule" "weekly_poll" {
  name                = "${var.project_name}-weekly-poll"
  schedule_expression = "cron(0 4 ? * SUN *)" # Sunday 04:00 UTC — a few hours after submit
  state               = var.enable_weekly_schedules ? "ENABLED" : "DISABLED"

  flexible_time_window { mode = "OFF" }

  target {
    arn      = aws_lambda_function.fit_scorer.arn
    role_arn = aws_iam_role.scheduler_invoke.arn
    input    = jsonencode({ trigger = "weekly-poll" })
  }
}
