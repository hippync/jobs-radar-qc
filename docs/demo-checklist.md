# Demo Readiness Checklist

Use this before sharing the repo link publicly or adding it to a resume/LinkedIn post.

## Frontend

- [ ] Production frontend URL is live and accessible
- [ ] `/trends` page loads and displays technology bars
- [ ] Job list filters work (stack, seniority, remote)
- [ ] README "Live demo" links are updated with real URLs
- [ ] Screenshots added to `docs/screenshots/` (see `docs/screenshots/README.md`)

## CI / GitHub

- [ ] GitHub Actions `daily_fetch` badge is green
- [ ] GitHub Actions `weekly_enrich` badge is green (or at least not red)
- [ ] No secrets committed to the repo (`git log --all --full-history -- '*.env'`)

## Local environment

- [ ] `.env.example` is complete and documents all required variables
- [ ] `npm run dev` works in `frontend/` with a local `.env.local`
- [ ] `python -m pipeline.orchestrator` dry-run works without errors
- [ ] `python -m agents.enricher --dry-run` reports counts without crashing
- [ ] `pytest` passes all tests
- [ ] `python scripts/debug_extraction.py <job-url>` produces evidence output for at least one real job

## Code hygiene

- [ ] No real secrets in `.env.example`
- [ ] `frontend/.env.local` is in `frontend/.gitignore`
- [ ] `.env` is in root `.gitignore`
- [ ] `pyproject.toml` dev dependencies are up to date
