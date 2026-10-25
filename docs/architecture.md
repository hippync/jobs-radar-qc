# Architecture

How Jobs Radar QC turns four ATS APIs into one feed and a tech-stack radar, and why it's built this way. For setup, see [Getting started](getting-started.md).

---

## Overview

ATS platforms are repetitive. They all expose a job list endpoint, return structured JSON and use the same handful of field names. So instead of writing a custom scraper per company, each source is defined as **three declarative spec files**:

```
specs/greenhouse/
├── source.md        # API documentation, quirks, dedup strategy
├── schema.json      # Endpoint config, company list, validation rules
└── extraction.xml   # Field mappings and derivation rules
```

The Python engine in `pipeline/` is generic and reads any spec. **Adding a new company means editing one JSON file. Adding a new ATS means writing three small files.**

```
    ┌──────────────────────────────────────────────────────────┐
    │                  GitHub Actions (crons)                  │
    │                                                          │
    │   daily_fetch.yml ─── pipeline/orchestrator.py           │
    │   weekly_enrich.yml ── agents/enricher.py (Sundays)      │
    └──────────────────────────────────────────────────────────┘
                                │  daily fetch
                    pipeline/orchestrator.py
                    (runs all specs in parallel)
                                │
                    ┌───────────┼───────────┬───────────┐
                    ▼           ▼           ▼           ▼
                  Greenhouse  Lever     Workable    Workday
                  (extractor)(extractor)(extractor)(extractor)
                    │           │           │           │
                    └───────────┴───────────┴───────────┘
                                │
                      Canonical Job schema
                      (is_qc, is_remote,
                      seniority, tech_stack …)
                                │
                                ▼
                      Supabase / PostgreSQL
                      (upsert + mark_inactive)
                                │
                                │  weekly enrichment pass
                                ▼
                      agents/enricher.py
                      WHERE enriched_prompt_hash != current
                                │  Claude Haiku
                                ▼
                      enriched_tech_stack[]
                      (LLM-extracted, versioned by prompt hash)
                                │
                                ▼
                      active_qc_jobs view
                      (merges tech_stack || enriched_tech_stack)
                                │
                                ▼
                      Next.js frontend
                      (job list + filters + /trends radar)
```

---

## The two layers

**Layer 1: daily and deterministic (`pipeline/`).** Runs every day at 12:17 UTC. It never makes an LLM call, so an Anthropic outage can't affect the feed. It writes `tech_stack` from rule-based extraction and never touches `enriched_tech_stack`.

**Layer 2: weekly and probabilistic (`agents/`).** Runs on Sundays at 13:00 UTC. It writes `enriched_tech_stack` and `enriched_prompt_hash` only, and never overwrites `tech_stack`. If it fails, the daily feed is unaffected.

The `active_qc_jobs` view merges both arrays for the frontend.

---

## Extraction pipeline

For each source spec, the engine runs three passes, then applies a title filter:

1. **Constants:** fixed values stamped on every record (`source = "greenhouse"`).
2. **Field mappings:** dot-path resolution from the raw API response (`location.name → location`). Lever's `lists[]` field (the requirements and responsibilities sections) is concatenated into `description_html` via `concat_array="lists"`, so technologies mentioned only there aren't silently dropped.
3. **Derived fields:** regex rules and keyword matching compute `is_qc`, `is_remote`, `seniority`, `employment_type` and `tech_stack`. HTML tags are stripped before keyword matching so tech names inside attributes (e.g. `data-path-to-node`) don't produce false positives. `word_boundary="true"` on `<keywords>` adds `\b` anchors, which prevents substring matches (`Rust` inside `trust`, `Vue` inside `Entrevue`, `Java` inside `JavaScript`).
4. **Non-tech filter:** jobs whose title matches a non-tech pattern (paralegal, sales, HR, legal, finance and their French equivalents) are dropped before upsert. They never reach the DB, and `mark_inactive()` deactivates any previously stored ones automatically.

All derivation logic lives in `extraction.xml`. There's no source-specific Python.

### Data quality safeguards

| Safeguard | What it prevents |
|---|---|
| HTML stripping before keyword matching | `data-path-to-node` attributes firing on tech names inside HTML |
| `word_boundary="true"` (`\b` anchors) | `Rust` in `trust`, `Vue` in `Entrevue`, `Java` in `JavaScript` |
| Lever `description` + `lists[]` concatenation | Technologies in requirements sections being silently dropped |
| Non-tech title filter at upsert time | Paralegal/sales/HR jobs reaching the DB or consuming LLM tokens |
| Regression tests from real-world bugs | Extraction fixes regressing on the inputs that originally caused them |
| `scripts/debug_extraction.py` | Trusting extraction output without per-job evidence |

---

## Agentic layer

The extraction pipeline is deterministic on purpose: it will never fail because of an LLM call. But regex keyword matching has hard limits. It misses technologies that aren't in the keyword list, gets nothing from short titles, and is blind to Workable jobs, which have no descriptions in the list endpoint.

The enrichment agent closes that gap with a second pass:

1. **Deterministic first.** The agent runs after the pipeline and writes to its own column, so a pipeline failure never blocks storage and an agent failure never corrupts rule-based results.
2. **LLM where regex can't reach.** Claude Haiku reads the full job description and returns technologies from the [canonical list](../core/canonical_tech_stack.json). Technologies outside the list are flagged with `?` for review rather than silently dropped.
3. **Non-tech roles skipped before the LLM call.** The extractor is the primary gate, but the enricher checks `is_non_tech_title()` again so edge cases can't burn API tokens or pollute `enriched_tech_stack`.
4. **Versioned prompts.** The prompt lives in [`agents/prompts/tech_extraction.md`](../agents/prompts/tech_extraction.md): editable, diffable, no code changes required. Each enriched job stores a hash of the rendered prompt, so changing the prompt triggers re-enrichment automatically.
5. **Validate before spending.** [`scripts/test_enrichment.py`](../scripts/test_enrichment.py) runs the prompt against real or fixture jobs and prints a side-by-side diff of rule-based vs LLM results, with no DB writes.

---

## Key technical decisions

**1. Spec-driven engine over per-company scrapers.**
Three declarative files per ATS; the engine is generic. Adding a new ATS takes an afternoon instead of a week, and the spec files are diffable, so you can see exactly what changed when a company's API quirks shift. *Tradeoff:* the spec format has to be expressive enough for every source, which took a few iterations.

**2. Deterministic pipeline first, LLM second pass.**
The pipeline always runs to completion and writes `tech_stack` from rule-based extraction. Claude Haiku runs afterwards in a separate weekly job, so a billing outage or API failure never affects the daily feed. *Tradeoff:* users see rule-based results until the weekly enrichment runs.

**3. A separate `enriched_tech_stack` column that the pipeline never touches.**
The daily upsert writes every column in the canonical schema. If enrichment shared a column with it, every upsert would overwrite LLM results with rule-based output. The separate column preserves enrichment across daily refreshes, and the view merges both arrays. *Tradeoff:* two columns to keep in sync in the view definition.

**4. Prompt hash versioning for automatic re-enrichment.**
The rendered system prompt (template plus the injected canonical tech list) is hashed with SHA-256, truncated to 8 characters, and stored per job. Change the prompt or add a tech to the canonical list and every stored hash becomes stale, so the enricher re-processes those jobs on the next run with no manual bookkeeping. *Tradeoff:* a careless change to the canonical list can trigger an unexpectedly large batch.

**5. Accurate deterministic extraction: HTML stripping, word boundaries and full field coverage.**
Keyword matching runs on plain text, not raw HTML, because descriptions can contain AI-generated attributes (e.g. Plusgrade's `data-path-to-node` on every paragraph) that would otherwise trigger false positives. `word_boundary="true"` is enforced in code with `\b` anchors. For Lever, the `description` body and the `lists[]` array are both concatenated into `description_html`. All three mechanisms are spec-driven, with no source-specific Python. *Tradeoff:* tests must use real API fixtures to catch API-structure changes the spec doesn't handle.

**6. Non-tech title filtering at the source, not in the view.**
Non-tech titles are skipped in `_fetch_company()` before upsert, so they're never stored. Filtering in the `active_qc_jobs` view instead would keep noisy data in the DB and duplicate the title logic in SQL. Filtering at the source also means `mark_inactive()` cleans up previously stored non-tech jobs on the next daily run. The enricher applies the same check as a secondary guard. *Tradeoff:* a title wrongly classified as non-tech won't appear until the regex is fixed and the next fetch runs.

**7. Role segment classification at query time, with no DB column.**
The 7 market segments (Mobile, FinTech, AI/ML, Cloud/Platform, Consulting, Enterprise, Startup SaaS) are computed from tech co-occurrence rules applied to `tech_stack[]` at query time. `classifySegment(tech_stack)` is a pure function, tested in isolation. The rules live in `frontend/lib/segmentHelpers.ts`, with `core/segment_rules.py` as a test-enforced Python spec. *Tradeoff:* both files must be kept in sync by hand when the rules change.

**8. A CSS-only bar chart on `/trends`, with no charting library.**
Each horizontal bar is a single `<div>` with a percentage width via Tailwind. The page is a Next.js Server Component with 1-hour ISR: zero JS bundle overhead, rendered server-side, and every bar links to a pre-filtered job list. *Tradeoff:* no animation, tooltips or interactivity, which is intentional for a radar view.

---

## Project structure

```
pipeline/
  extractor.py      # Generic spec-driven fetch + extraction engine
  orchestrator.py   # Runs all specs in parallel, writes to DB

agents/
  enricher.py       # LLM tech-stack enrichment (weekly run)
  prompt_utils.py   # Render prompt, hash, parse response, strip HTML
  prompts/
    tech_extraction.md  # Versioned system prompt template

core/
  canonical_tech_stack.json # 123 canonical tech names across 10 categories (v2)
  segment_rules.py          # Segment rules: test-enforced spec for segmentHelpers.ts, no production caller

specs/
  greenhouse/               # 17 companies
  lever/                    # 17 companies
  workable/                 # 9 companies
  workday/                  # 8 companies
    source.md               # API docs, rate limits, known quirks
    schema.json             # Endpoint config + company list
    extraction.xml          # Field mappings + derivation rules

storage/
  supabase_client.py        # Singleton client
  jobs_repository.py        # upsert_jobs(), mark_inactive()

scripts/
  migrate*.sql              # DB schema, enrichment view, indexes, RPCs (run order in getting-started.md)
  test_enrichment.py        # Dry-run: compare rule-based vs LLM, no DB writes
  debug_extraction.py       # Per-technology debug output for a single job URL

tests/
  fixtures/                 # Sample jobs + real API responses for offline tests
  test_lever_regression.py  # Regression tests for extraction accuracy (BHVR, Plusgrade)
  test_segmentation.py      # Spec tests for core/segment_rules.py
  …                         # Enrichment parsing, prompt hash, tech gate, Workable, Workday

frontend/                   # Next.js 16, App Router
  app/
    page.tsx                # Job list with filters + pagination
    trends/page.tsx         # Tech Stack Radar (Server Component, 1h ISR)
    saved/page.tsx          # Saved jobs: Kanban board (watching/applied/interviewing/archived)
    api/search/route.ts     # Full-database job search endpoint
    api/radar/route.ts      # Standalone SVG export of the radar (embeddable)
  components/               # JobCard, FilterSidebar, AlertRuleEditor, KanbanCard, RadarChartClient, …
  lib/
    segmentHelpers.ts       # Role segment classification (mirrors segment_rules.py)
    radarData.ts            # Server-side radar data fetching with segment filter
    alertsStore.ts          # localStorage-backed "save as alert" rules
    types.ts                # Job type, mirrors the active_qc_jobs view's columns
```

The company list for each ATS is in its `schema.json`. More on the radar itself is in [Tech Stack Radar](tech-stack-radar.md).
