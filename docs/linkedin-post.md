# LinkedIn Content — Jobs Radar QC

---

## Short post

I built a Quebec tech job market radar because LinkedIn was too noisy.

Every week I was manually checking a dozen company career pages to track what the Montreal/Quebec market was hiring for. So I automated it.

Jobs Radar QC pulls live roles from Greenhouse, Lever, and Workable, normalizes them into a unified schema, and shows a Tech Stack Radar — which technologies are actually growing across active roles.

The interesting part wasn't the scraping. It was building a spec-driven pipeline where adding a new ATS is three files instead of a week of glue code, and separating deterministic regex extraction from a weekly Claude Haiku enrichment pass so the feed never depends on an LLM to run.

Stack: Python 3.12 · Supabase · Claude Haiku · Next.js Server Components · GitHub Actions

Repo: https://github.com/hippync/jobs-radar-qc

---

## Long post (storytelling version)

Every Monday morning I'd open 12 browser tabs to check company career pages.

Not because I enjoy it — because there's no better way to know what the Quebec tech market is actually hiring for. LinkedIn shows you what's sponsored. Job boards show you what's stale. ATS pages show you what's real.

After the third or fourth week of this, I decided to build the thing I was wishing existed.

**Jobs Radar QC** aggregates open roles directly from Greenhouse, Lever, and Workable — the three ATS platforms used by most Montreal tech companies. Every day, a GitHub Actions cron fetches the latest postings, normalizes them into a canonical schema, and upserts them into Supabase. Every Sunday, a Claude Haiku enrichment pass fills in tech stacks for jobs that have no description in the list endpoint (looking at you, Workable).

The engineering that I'm actually proud of:

**Spec-driven over scraper-driven.** Instead of one Python file per company, each ATS is defined by three declarative files: API docs, a schema config, and an extraction spec. The engine reads any spec. Adding a new company is editing one JSON file. Adding a new ATS takes an afternoon.

**Deterministic-first, LLM second.** The daily pipeline always completes, whether or not the Anthropic API is reachable. Regex keyword matching writes `tech_stack`. Claude Haiku writes `enriched_tech_stack` in a separate column, a week later. A billing outage doesn't take down the feed.

**Prompt hash versioning.** The enrichment prompt is SHA-256 hashed and stored per job. Change the prompt or add a technology to the canonical list, and every job's hash goes stale — the enricher re-processes them automatically on the next run. No manual bookkeeping.

**Extraction accuracy.** Early on I noticed Plusgrade's ATS was generating `data-path-to-node` attributes on every paragraph, and the extractor was matching tech names inside those HTML attributes. The fix: strip HTML before keyword matching. Then there were substring issues: `Java` inside `JavaScript`, `Rust` inside `trust`, `Vue` inside `Entrevue`. The fix: `\b` anchors in the spec, enforced by the engine. These weren't bugs I anticipated — they were bugs real data surfaced, fixed with regression tests.

The result is a live job radar for the Montreal/Quebec tech scene, a Tech Stack Radar at `/trends`, and a codebase I'm genuinely happy to show in an interview.

Repo: https://github.com/hippync/jobs-radar-qc

---

## Carousel outline (5 slides)

**Slide 1 — The problem**
Quebec tech jobs are scattered across 50+ career pages.
No single place to see what's hiring in Python, Go, or React across Montreal startups — let alone track which stacks are growing.

**Slide 2 — The idea**
Track the source of truth: company ATS pages directly.
Greenhouse, Lever, and Workable are what companies actually manage. If a job is there, it's real and it's open.

**Slide 3 — The architecture**
Spec-driven Python pipeline → Canonical job schema → Supabase/PostgreSQL → Weekly Claude Haiku enrichment → active_qc_jobs view → Next.js Tech Stack Radar.
3 ATS platforms. 12 companies. 76 canonical technologies. Daily fetch. Weekly LLM pass.

**Slide 4 — The engineering lesson**
Deterministic-first. LLM second. Evidence-based extraction.
The pipeline always completes without an LLM. Regex finds the obvious stacks. Claude fills the gaps. Every match has evidence you can audit. Every prompt change triggers automatic re-enrichment.

**Slide 5 — The result**
A live job radar and tech stack trends for Montreal/Quebec.
See which technologies are growing across active roles — without reading every job posting.
Repo: github.com/hippync/jobs-radar-qc
