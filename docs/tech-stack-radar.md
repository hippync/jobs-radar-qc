# Tech Stack Radar

The Tech Stack Radar ([live at /trends](https://jobs-radar-qc.vercel.app/trends)) shows which technologies appear most frequently across active Quebec tech job postings, updated daily.

---

## What it shows

Each bar represents one canonical technology. The count is the number of **currently active** job postings that mention that technology. Clicking a bar filters the job list to those postings.

The page is a Next.js Server Component with 1-hour ISR — no client JavaScript, renders server-side, revalidates automatically.

---

## How technologies are detected

Detection runs in two independent passes:

**Pass 1 — Rule-based (daily)**
The extraction pipeline matches job descriptions against a keyword list using regex with `\b` word boundaries. Runs every day via GitHub Actions. Results stored in `tech_stack[]`.

**Pass 2 — LLM enrichment (weekly, Sundays)**
Claude Haiku reads the full job description and returns technologies from the canonical list below. Results stored in `enriched_tech_stack[]`. A failure here never affects Pass 1 results.

The Supabase `active_qc_jobs` view merges both columns (`tech_stack || enriched_tech_stack`) before serving the frontend — so the radar reflects whichever pass has the most signal.

---

## Role segments

The radar can be filtered by market archetype. Each job is classified into one of 7 segments at query time — no database column, computed from tech co-occurrence rules applied to `tech_stack[]`.

| Segment | Classification rule |
|---|---|
| Mobile | React Native, Flutter, or SwiftUI alone; or iOS+Swift pair; or Android+Kotlin pair |
| FinTech | (Java or Kotlin) + Kafka |
| AI/ML | Python + ≥1 AI/ML tool; or ≥2 AI/ML tools regardless of language |
| Cloud/Platform | ≥2 of: Kubernetes, Terraform, Docker, AWS, GCP, GitHub Actions, Helm, ArgoCD, Prometheus, Grafana, Jenkins, Ansible |
| Consulting | (.NET or C#) + Angular |
| Enterprise | (Java or Spring Boot) + (AWS, Azure, or GCP) + (SQL, PostgreSQL, or MySQL) |
| Startup SaaS | (React, Next.js, Vue, or Svelte) + (Node.js, Express, NestJS, FastAPI, or Django) |

Rules are evaluated in priority order (Mobile → FinTech → AI/ML → Cloud/Platform → Consulting → Enterprise → Startup SaaS). Jobs matching no rule appear only under "All". Rules live in [`core/segment_rules.py`](../core/segment_rules.py) and [`frontend/lib/segmentHelpers.ts`](../frontend/lib/segmentHelpers.ts) — both files must be kept in sync.

---

## Canonical technology list

123 technologies tracked across 10 categories (v2). Adding a technology to this list invalidates all stored prompt hashes and triggers a full re-enrichment on the next Sunday run.

| Category | Technologies |
|---|---|
| Languages | Python, Java, TypeScript, JavaScript, C#, Go, SQL, Kotlin, Swift, Rust, Ruby, PHP, Scala, Dart, R, Elixir, C++ |
| Frontend | React, Next.js, Angular, Vue, Tailwind, Redux, Svelte, Vite, tRPC, Remix, Storybook |
| Backend | Spring Boot, Node.js, Express, NestJS, .NET, Django, FastAPI, GraphQL, REST, gRPC, Rails, Laravel, Flask, ASP.NET, Celery, Gin |
| Databases | PostgreSQL, MySQL, MongoDB, Redis, DynamoDB, Snowflake, Elasticsearch, ClickHouse, BigQuery, Cassandra, Firebase, Supabase, SQLite |
| Cloud | AWS, Azure, GCP, Linux, Nginx, Cloudflare, Vercel, DigitalOcean, Heroku |
| DevOps | Docker, Kubernetes, Terraform, Helm, GitHub Actions, Jenkins, ArgoCD, Prometheus, Grafana, Ansible, GitLab CI, CircleCI, Pulumi, Vault |
| Data | Pandas, Spark, Databricks, Airflow, TensorFlow, PyTorch, LangChain, OpenAI, Vector DB, dbt, Kafka, MLflow, NumPy, scikit-learn, Hugging Face, Flink, RabbitMQ, Weights & Biases |
| Mobile | React Native, Flutter, SwiftUI, Android, iOS |
| Testing | Jest, Cypress, Playwright, Selenium, JUnit, Postman, Vitest, pytest, Mocha, RSpec |
| AI Concepts | LLM, RAG, AI Agents, Prompt Engineering, Fine-tuning, Embeddings, Semantic Search, NLP, Computer Vision, GenAI |

The canonical list lives in [`core/canonical_tech_stack.json`](../core/canonical_tech_stack.json).

---

## Accuracy safeguards

| Safeguard | What it prevents |
|---|---|
| HTML stripping before matching | HTML attributes (e.g. `data-path-to-node`) firing on tech names |
| `\b` word boundaries | `Rust` in `trust`, `Vue` in `Entrevue`, `Java` in `JavaScript` |
| Lever `lists[]` concatenation | Technologies in requirements sections being silently dropped |
| Non-tech title filter | Paralegal/sales/HR jobs consuming LLM tokens or appearing in counts |

---

## Reading the radar

A full-width "how to read" strip sits below the radar circle with three plain-language cues: **bigger bubble = more jobs**, **closer to center = stronger demand**, **click to filter roles**. Earlier versions also labeled the four concentric rings ("Niche," "Common," "Popular," "Most in demand") — those were removed for adding visual clutter without much extra clarity, so demand is communicated only through bubble position and size now.

The guide is UI-only — the downloadable/embeddable SVG (`renderRadarSvg()`, served via `/api/radar?format=svg`) renders without it, since a static image embedded elsewhere (e.g. a GitHub README) has no interactive "click to filter" affordance to explain.

---

## Adding a technology

Edit [`core/canonical_tech_stack.json`](../core/canonical_tech_stack.json) and add the name under the appropriate category. On the next Sunday run, all jobs will be re-enriched automatically — no other changes needed.

For rule-based detection, also add the keyword (and a regex pattern if the name needs escaping, e.g. `C\+\+`) to the relevant `specs/{ats}/extraction.xml`.
