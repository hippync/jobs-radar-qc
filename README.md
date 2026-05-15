# Jobs Radar QC

> Public ATS jobs aggregator for Montreal/Quebec tech scene — built with spec-driven extraction and agentic workflows.

## The problem

Tech job hunting in Quebec means manually checking 50+ company career pages and multiple job boards every day. There's no single, low-friction place to see what's hiring in Python, .NET, Next.js, or any specific stack across Montreal startups and scale-ups — let alone track trends over time.

## The solution

This aggregator pulls jobs from 10+ public ATS APIs and career pages, deduplicates them, normalizes the data into a canonical schema, and surfaces:

- 📍 What's hiring in Montreal/Quebec by tech stack
- 📈 Hiring trends over 30 days (which techs are growing)
- 🔔 Filterable feed with email alerts (planned)
- 🤖 Resume-to-job matching with Claude API (planned)

## Why this is interesting technically

This isn't a hardcoded scraper. Each source (Greenhouse, Lever, Shopify Careers, etc.) is defined as a **declarative spec** — three files describing what to fetch, how to validate it, and how to extract fields. The agentic core reads these specs and executes them.

- `.md` — Human + LLM-readable source documentation
- `.json` — Endpoint config, validation schemas, company lists
- `.xml` — Extraction rules, field mappings, transformations

Adding a new source means writing three small files, not modifying the engine.

## Stack

- **Backend**: Python 3.12, httpx (async), BeautifulSoup, Pydantic v2
- **Storage**: PostgreSQL via Supabase
- **Pipeline**: GitHub Actions (daily cron)
- **Frontend**: Next.js 14 + Tailwind + Recharts *(coming in week 2)*
- **Deploy**: Vercel

## Quick start

```bash
git clone https://github.com/hippync/jobs-radar-qc.git
cd jobs-radar-qc
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env  # then fill in Supabase keys
python -m agents.orchestrator
```

## Project structure

- specs/         # One folder per source: source.md + schema.json + extraction.xml
- agents/        # Generic engine: extractor, normalizer, validator, orchestrator
- core/          # Canonical schema, shared Pydantic models
- storage/       # Supabase client and queries
- tests/         # Unit tests + recorded HTTP fixture

## Status

🚧 Active development — sprint 1 in progress.

## License

MIT
