# Jobs Radar QC

A spec-driven ATS aggregator for the Quebec tech scene. Two independent layers: a deterministic daily pipeline and a weekly LLM enrichment pass.

---

## The two-layer rule — never break this

**Layer 1 — Daily, deterministic (`pipeline/`)**
- Runs via GitHub Actions cron every day
- Must complete without any LLM call — an Anthropic outage must not affect the feed
- Writes `tech_stack` from rule-based regex extraction
- **Never writes `enriched_tech_stack`** — that column belongs to Layer 2 only

**Layer 2 — Weekly, probabilistic (`agents/`)**
- Runs every Sunday via GitHub Actions
- Writes `enriched_tech_stack` and `enriched_prompt_hash` only
- **Never overwrites `tech_stack`** — that column belongs to Layer 1
- Failure here doesn't affect the daily feed

The `active_qc_jobs` Supabase view merges both columns (`tech_stack || enriched_tech_stack`) for the frontend.

---

## Key invariants

1. `pipeline/` must not make LLM calls under any circumstances
2. All extraction logic lives in `specs/{ats}/extraction.xml` — no source-specific Python in the engine
3. HTML must be stripped before keyword matching (prevents false positives on HTML attributes)
4. `word_boundary="true"` in extraction specs adds `\b` anchors — required to prevent substring matches (`Rust` in `trust`, `Java` in `JavaScript`)
5. Non-tech jobs (paralegal, HR, sales, legal, finance + French equivalents) are filtered before upsert — never at the view level
6. `core/canonical_tech_stack.json` is used by both layers — changing it invalidates all stored prompt hashes and triggers full re-enrichment; don't add technologies carelessly

---

## How specs work

Each ATS is three declarative files in `specs/{ats}/`:

| File | Purpose |
|---|---|
| `source.md` | API docs, quirks, dedup strategy — human reference |
| `schema.json` | Endpoint config, company list, field validation |
| `extraction.xml` | Field mappings and derivation rules |

The engine (`pipeline/extractor.py`) is generic. **Adding a company = edit `schema.json`. Adding an ATS = write three files.**

**Extraction XML: important attributes**

- `word_boundary="true"` — wraps each keyword with `\b` anchors
- `concat_array="lists"` — Lever only: concatenates `lists[]` items into `description_html` so requirements sections aren't dropped
- `strategy="collect-all"` — used on `tech_stack` to accumulate all matches instead of first-match

**Dedup key:** `(source, external_id)` — unique constraint enforced in DB via ON CONFLICT DO UPDATE.

---

## Role segment classification

Jobs on `/trends` can be filtered by market archetype. Classification is computed at query time from `tech_stack` — no DB column, no LLM call.

Rules live in two files that **must be kept in sync**:
- `core/segment_rules.py` — Python; classification actually runs only in `segmentHelpers.ts`, this module has no production caller and exists solely as the test-enforced spec `test_segmentation.py` pins the TS implementation against
- `frontend/lib/segmentHelpers.ts` — TypeScript (used by the Next.js frontend)

Priority order (first match wins):
`mobile > fintech > ai_ml > cloud_platform > consulting > enterprise > startup_saas`

| Segment | Rule |
|---|---|
| `mobile` | React Native, Flutter, or SwiftUI alone; or iOS+Swift pair; or Android+Kotlin pair |
| `fintech` | (Java or Kotlin) + Kafka |
| `ai_ml` | Python + ≥1 AI/ML tool; or ≥2 AI/ML tools regardless of language |
| `cloud_platform` | ≥2 of: Kubernetes, Terraform, Docker, AWS, GCP, GitHub Actions, Helm, ArgoCD, Prometheus, Grafana, Jenkins, Ansible |
| `consulting` | (.NET or C#) + Angular |
| `enterprise` | (Java or Spring Boot) + (AWS, Azure, or GCP) + (SQL, PostgreSQL, or MySQL) |
| `startup_saas` | (React, Next.js, Vue, or Svelte) + (Node.js, Express, NestJS, FastAPI, or Django) |

No match → `null` (job appears under "All" only). Tests live in `tests/test_segmentation.py`.

---

## Commands

```bash
# Setup
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env              # fill in Supabase + Anthropic keys

# Pipeline
python -m pipeline.orchestrator   # run all specs
python -m pipeline.extractor greenhouse   # run single ATS (greenhouse | lever | workable)

# Enrichment
python -m agents.enricher --dry-run      # print counts only, no API calls
python -m agents.enricher --limit 50     # cap batch size
python scripts/test_enrichment.py        # side-by-side diff vs rule-based, no DB writes

# Debug
python scripts/debug_extraction.py <job-url>   # per-technology evidence for one job

# Tests
pytest
pytest tests/test_lever_regression.py -v       # regression tests for extraction accuracy

# Lint
ruff check . && ruff format . && mypy .
```

---

## Code style

- Python 3.12, line length 100 (`pyproject.toml`)
- `from __future__ import annotations` on every Python file
- `structlog` for all logging — never `print()` in `pipeline/`, `agents/`, `storage/`
- No model-validation library — plain dicts and functions, shapes documented via type hints
- `pytest-asyncio` with `asyncio_mode = "auto"` — no `@pytest.mark.asyncio` needed

---

## Tests

- Fixtures in `tests/fixtures/` — real API responses for offline testing
- `test_lever_regression.py` — regression tests derived from real production bugs; always run before touching extraction logic
- Tests cover extraction and enrichment logic, not DB writes — no live Supabase connection needed

---

## Environment variables

See `.env.example`. Pipeline requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Enricher additionally requires `ANTHROPIC_API_KEY`. Frontend uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (in `frontend/.env.local`).
