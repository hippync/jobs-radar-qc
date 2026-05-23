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

## Canonical technology list

76 technologies tracked across 10 categories (v2). Adding a technology to this list invalidates all stored prompt hashes and triggers a full re-enrichment on the next Sunday run.

| Category | Technologies |
|---|---|
| Languages | Python, Java, TypeScript, JavaScript, C#, Go, SQL, Kotlin, Swift, Rust |
| Frontend | React, Next.js, Angular, Vue, Tailwind, Redux, Svelte |
| Backend | Spring Boot, Node.js, Express, NestJS, .NET, Django, FastAPI, GraphQL, REST, gRPC |
| Databases | PostgreSQL, MySQL, MongoDB, Redis, DynamoDB, Snowflake, Elasticsearch, ClickHouse |
| Cloud | AWS, Azure, GCP, Linux, Nginx, Cloudflare |
| DevOps | Docker, Kubernetes, Terraform, Helm, GitHub Actions, Jenkins, ArgoCD, Prometheus, Grafana, Ansible |
| Data & AI | Pandas, Spark, Databricks, Airflow, TensorFlow, PyTorch, LangChain, OpenAI, Vector DB, dbt, Kafka, MLflow |
| Mobile | React Native, Flutter, SwiftUI, Android, iOS |
| Testing | Jest, Cypress, Playwright, Selenium, JUnit, Postman |
| AI Concepts | LLM, RAG |

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

## Adding a technology

Edit [`core/canonical_tech_stack.json`](../core/canonical_tech_stack.json) and add the name under the appropriate category. On the next Sunday run, all jobs will be re-enriched automatically — no other changes needed.

For rule-based detection, also add the keyword (and a regex pattern if the name needs escaping, e.g. `C\+\+`) to the relevant `specs/{ats}/extraction.xml`.
