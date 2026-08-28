# Deploy runbook — fit-scoring agent (Phase 3)

Follow this in order. Steps marked **(you)** need something only you can do — a web console action, or a value from a dashboard only you have access to. Everything else can be run directly.

## 0. Prerequisites

- **(you)** `SUPABASE_DB_URL` — Supabase dashboard → Project Settings → Database → Connection pooling → copy the **Transaction mode** URI. Put it in `.env` as `SUPABASE_DB_URL=...`.
- **(you)** AWS credentials — run `aws configure` in a terminal on this machine (writes to `~/.aws/credentials`, not typed into any chat). Recommended: a dedicated IAM user, not root. Verify: `aws sts get-caller-identity`.
- **(you)** Anthropic Console spend cap set at https://console.anthropic.com — do this before step 3.

## 1. Apply the pending database migration

`scripts/migrate_fit_scoring.sql` (Phase 1) creates `candidate_profiles` and `job_matches` — confirmed via a live smoke test that these don't exist in production yet. Run it via `psql` against `SUPABASE_DB_URL`:

```bash
psql "$SUPABASE_DB_URL" -f scripts/migrate_fit_scoring.sql
```

## 2. Create the checkpoint tables

```bash
python -m scripts.setup_checkpointer
```

## 3. AWS Budget alert — apply this alone, first

```bash
cd infra/terraform
terraform init
terraform apply -target=aws_budgets_budget.fit_scorer \
  -var="budget_email=you@example.com" \
  -var="anthropic_api_key=$ANTHROPIC_API_KEY" \
  -var="supabase_service_role_key=$SUPABASE_SERVICE_ROLE_KEY" \
  -var="supabase_db_url=$SUPABASE_DB_URL" \
  -var="supabase_url=$SUPABASE_URL" \
  -var="image_uri=placeholder"
```

Confirm the budget shows up in the AWS Budgets console, and that the Anthropic Console spend cap (step 0) is live, before continuing.

## 4. Build and push the image

```bash
cd infra/terraform
ECR_URL=$(terraform output -raw ecr_repository_url 2>/dev/null || echo "<apply step 5 first to get this>")
```

(Chicken-and-egg: the ECR repo is created in step 5, along with everything else. Do step 5 once with a placeholder `image_uri`, then push, then re-apply with the real one — Terraform handles this fine as a two-pass apply.)

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker build -t jobs-radar-qc-fit-scorer .
docker tag jobs-radar-qc-fit-scorer:latest <ecr_repository_url>:latest
docker push <ecr_repository_url>:latest
```

## 5. Apply the rest of the infrastructure

Weekly EventBridge schedules stay **disabled** (`enable_weekly_schedules = false`, the default) until step 7.

```bash
terraform apply \
  -var="budget_email=you@example.com" \
  -var="anthropic_api_key=$ANTHROPIC_API_KEY" \
  -var="supabase_service_role_key=$SUPABASE_SERVICE_ROLE_KEY" \
  -var="supabase_db_url=$SUPABASE_DB_URL" \
  -var="supabase_url=$SUPABASE_URL" \
  -var="image_uri=<ecr_repository_url>:latest"
```

## 6. One manual smoke test — not a load test

```bash
curl -X POST "$(terraform output -raw function_url)" \
  -d '{"resume_text": "..."}'
```

Review the response and the CloudWatch log group (`/aws/lambda/jobs-radar-qc-fit-scorer`) before continuing.

## 7. Enable the weekly schedules

Only after reviewing step 6:

```bash
terraform apply -var="enable_weekly_schedules=true" <...same other vars as step 5...>
```

## Optional: CI image builds

`.github/workflows/build_lambda_image.yml` builds and pushes on merge to `main`. Needs these repo secrets, set by **(you)** in GitHub → Settings → Secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ACCOUNT_ID`, `AWS_REGION`, `ECR_REPOSITORY`.

## Tuning

Lambda memory (`lambda_memory_mb`, default 512) and timeout (`lambda_timeout_s`, default 60) are starting estimates, not benchmarked. Watch the first few real CloudWatch invocations (`Max Memory Used`, `Duration` in the REPORT line) and adjust via `-var` on a future apply.
