variable "aws_region" {
  description = "AWS region to deploy into — ca-central-1 (Montreal) for latency to Quebec users and data residency"
  type        = string
  default     = "ca-central-1"
}

variable "project_name" {
  description = "Short name used to prefix/tag all resources"
  type        = string
  default     = "jobs-radar-qc-fit-scorer"
}

variable "image_uri" {
  description = "Full ECR image URI (repo:tag) to deploy. Set after the first image push — see infra/RUNBOOK.md."
  type        = string
}

variable "anthropic_api_key" {
  description = "Anthropic API key, stored as an SSM SecureString. Pass via TF_VAR_anthropic_api_key, never committed."
  type        = string
  sensitive   = true
}

variable "supabase_service_role_key" {
  description = "Supabase service-role key, stored as an SSM SecureString. Pass via TF_VAR_supabase_service_role_key, never committed."
  type        = string
  sensitive   = true
}

variable "supabase_db_url" {
  description = "Supabase pooled Postgres connection string (from the Supabase dashboard), stored as an SSM SecureString. Pass via TF_VAR_supabase_db_url, never committed."
  type        = string
  sensitive   = true
}

variable "supabase_url" {
  description = "Supabase project URL — not secret, set as a plain Lambda env var"
  type        = string
}

variable "budget_email" {
  description = "Email notified when the AWS budget alert fires"
  type        = string
}

variable "budget_limit_usd" {
  description = "Monthly AWS budget limit in USD — the alert fires once actual spend exceeds this"
  type        = number
  default     = 5
}

variable "cors_allow_origin" {
  description = "Origin allowed to call the Function URL (the frontend's domain, once Phase 4 exists)"
  type        = string
  default     = "*"
}

variable "enable_weekly_schedules" {
  description = "Whether the weekly submit/poll EventBridge schedules are enabled. Stays false until a manual on-demand smoke test has been reviewed."
  type        = bool
  default     = false
}

variable "lambda_memory_mb" {
  description = "Lambda memory in MB — starting estimate, not benchmarked. Tune after watching real CloudWatch invocations."
  type        = number
  default     = 512
}

variable "lambda_timeout_s" {
  description = "Lambda timeout in seconds — bounds the on-demand path scoring up to MATCH_JOB_LIMIT jobs concurrently"
  type        = number
  default     = 60
}
