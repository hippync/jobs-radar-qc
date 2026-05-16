# Jobs Radar QC

> A public ATS aggregator for the Montreal/Quebec tech scene — spec-driven, open-source, no vendor lock-in.

[![Daily fetch](https://github.com/hippync/jobs-radar-qc/actions/workflows/daily_fetch.yml/badge.svg)](https://github.com/hippync/jobs-radar-qc/actions/workflows/daily_fetch.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/)

---

## The problem

Tech job hunting in Quebec means checking 50+ company career pages and job boards every day. There's no single place to see what's actively hiring in Python, Go, .NET, or any specific stack across Montreal startups and scale-ups — let alone track which technologies are growing over time.

## What this does

Jobs Radar QC pulls open roles from major ATS platforms (Greenhouse, Lever, Workable, …), deduplicates them, normalizes the data into a unified schema, and surfaces:

- What's hiring in Montreal/Quebec right now, filterable by tech stack
- Hiring trends over 30 days — which technologies are on the rise
- When a job first appeared and how long it's been open

---

## Architecture

The core insight is that ATS platforms are repetitive — they all expose a job list endpoint, return structured JSON, and use the same handful of field names. Instead of writing a custom scraper per company, each source is defined as **three declarative spec files**:

```
specs/greenhouse/
├── source.md        # API documentation, quirks, dedup strategy
├── schema.json      # Endpoint config, company list, validation rules
└── extraction.xml   # Field mappings and derivation rules
```

The Python engine in `pipeline/` is generic and reads any spec. **Adding a new company means editing one JSON file. Adding a new ATS means writing three small files.**

```
┌─────────────────────────────────────────────────────┐
│                   GitHub Actions (daily cron)        │
└───────────────────────┬─────────────────────────────┘
                        │
              pipeline/orchestrator.py
              (runs all specs in parallel)
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
   Greenhouse         Lever       Workable  …
  (extractor)      (extractor)  (extractor)
          │             │             │
          └─────────────┴─────────────┘
                        │
              Canonical Job schema
              (is_qc, is_remote,
               seniority, tech_stack …)
                        │
                        ▼
              Supabase / PostgreSQL
              (upsert + mark_inactive)
```

### Extraction pipeline

For each source spec, the engine runs three passes:

1. **Constants** — fixed values stamped on every record (`source = "greenhouse"`)
2. **Field mappings** — dot-path resolution from the raw API response (`location.name → location`)
3. **Derived fields** — regex rules and keyword matching to compute `is_qc`, `is_remote`, `seniority`, `employment_type`, and `tech_stack`

All derivation logic lives in `extraction.xml` — no source-specific Python.

---

## Stack

| Layer | Technology |
|---|---|
| Fetch | Python 3.12, httpx (async) |
| Parse | lxml, BeautifulSoup |
| Validate | Pydantic v2 |
| Storage | PostgreSQL via Supabase |
| Pipeline | GitHub Actions (daily cron) |
| Frontend | Next.js 16 + Tailwind CSS |

---

## Project structure

```
pipeline/
  extractor.py      # Generic spec-driven fetch + extraction engine
  orchestrator.py   # Runs all specs in parallel, writes to DB

core/
  canonical_schema.json   # Unified Job model (JSON Schema draft-07)

specs/
  greenhouse/             # Broadsign, AppDirect, AlayaCare, Valtech
    source.md             # API docs, rate limits, known quirks
    schema.json           # Endpoint config + company list
    extraction.xml        # Field mappings + derivation rules
  lever/                  # Plusgrade, Mirego, Osedea
    source.md
    schema.json
    extraction.xml
  workable/               # Tecsys, Nuvei
    source.md
    schema.json
    extraction.xml

storage/
  supabase_client.py      # Singleton client
  jobs_repository.py      # upsert_jobs(), mark_inactive()

scripts/
  migrate.sql             # Initial DB schema + indexes + RLS

frontend/                 # Next.js 16 — job list with filters
  app/                    # App Router pages
  components/             # JobCard, JobFilters
  lib/                    # Supabase client, shared types

tests/
  fixtures/               # Recorded HTTP responses for offline testing
```

---

## Status

| Component | Status |
|---|---|
| Greenhouse spec | ✅ Live — 4 QC companies |
| Extraction pipeline | ✅ Live |
| Supabase storage | ✅ Live |
| Daily cron (GitHub Actions) | ✅ Live |
| Lever spec | ✅ Live — 3 QC companies |
| Workable spec | ✅ Live — 2 QC companies |
| Next.js frontend | ✅ Live — job list + filters |
| Agentic layer | 📋 Planned |

---

## Quick start

```bash
git clone https://github.com/hippync/jobs-radar-qc.git
cd jobs-radar-qc
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env   # add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

# Run the full pipeline once
python -m pipeline.orchestrator

# Or test a single source
python -m pipeline.extractor greenhouse

# Run the frontend
cd frontend && npm install && npm run dev   # → http://localhost:3000
```

### Running the DB migration

Paste `scripts/migrate.sql` into the Supabase SQL editor and run. Creates the `jobs` table, dedup constraint, GIN index on `tech_stack`, RLS policy (public read, service-role write), and a trigger that freezes `first_seen_at` after first insert.

---

## Adding a new company

Open the relevant `specs/{ats}/schema.json` and add an entry to the `companies` array:

```json
{ "name": "Your Company", "slug": "your-ats-slug" }
```

Verify the slug before adding (examples per ATS):

```bash
# Greenhouse
curl -s "https://boards-api.greenhouse.io/v1/boards/your-slug/jobs" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['jobs']), 'jobs')"

# Lever
curl -s "https://api.lever.co/v0/postings/your-slug?mode=json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)), 'jobs')"

# Workable
curl -s "https://apply.workable.com/your-slug/llms.txt" | grep "current opening"
```

That's it — no Python changes needed.

---

## Adding a new ATS

Copy `specs/_template/` to `specs/your-ats/`, then fill in the three files following the Greenhouse spec as a reference. The engine picks up new specs automatically on the next run.

---

## License

MIT — see [LICENSE](LICENSE).
