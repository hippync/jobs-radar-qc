# Workable — Source Documentation

## What is Workable?

Workable is an ATS used by a range of tech and non-tech companies. Unlike Greenhouse
and Lever, Workable does not expose a public JSON API. Instead it provides a
**machine-readable Markdown table** endpoint (`jobs.md`) designed for LLM consumption.

## API overview

**Base URL:**
```
https://apply.workable.com/{company_slug}/jobs.md
```

**Method:** GET  
**Auth:** None (public endpoint)  
**Format:** Markdown pipe-table

### Key query parameters

| Param                    | Effect                                         |
|--------------------------|------------------------------------------------|
| `location[0][country]`   | Filter by country name (e.g. `Canada`)         |
| `location[0][city]`      | Narrow to a city within that country           |
| `query`                  | Free-text search across titles and descriptions |

We always pass `location[0][country]=Canada` to get all Canadian postings.
The `is_qc` derivation rule then filters down to Quebec-specific roles.

### Why not `?query=montreal`?

Text search is fuzzy and misses postings that say "Montréal" or omit the city name
entirely. Location filtering is more precise, and since all our target companies are
Canadian, the country filter reliably captures what we need.

### Pagination and limits

- Companies with ≤ ~50 open positions: `jobs.md` with no filter returns all jobs.
- Companies with > ~50 positions: `jobs.md` returns a search UI (no table rows)
  unless a filter is applied.
- Always pass the Canada filter to get consistent results regardless of company size.

---

## Response structure

The endpoint returns a Markdown document. The job list is a pipe-table:

```markdown
| Title | Department | Location | Type | Salary | Posted | Details |
|-------|-----------|----------|------|--------|--------|---------|
| Senior Backend Engineer | R&D | Montreal, Canada (Hybrid) | Full-time | — | 2026-05-01 | [View](https://apply.workable.com/tecsys/jobs/view/ABC123DE.md) |
```

### Column breakdown

| Column     | Canonical field   | Notes                                              |
|------------|-------------------|----------------------------------------------------|
| Title      | `title`           | Raw job title                                      |
| Department | `department`      | Org department                                     |
| Location   | `location`        | `"City, Country (WorkplaceType)"` — includes mode  |
| Type       | `employment_type` | Full-time, Part-time, Contract, — (unknown)        |
| Salary     | ignored           | Rarely populated, always `—`                       |
| Posted     | `posted_at`       | ISO date `YYYY-MM-DD`, no timezone → treated as UTC |
| Details    | derives `external_id` + `source_url` | Markdown link to the `.md` detail view |

### Detail URL → fields

The Details column contains a Markdown link:
```
[View](https://apply.workable.com/{slug}/jobs/view/{SHORTCODE}.md)
```

The extractor automatically derives:
- `external_id` = `SHORTCODE` (hex string, e.g. `BD055E1DA7`)
- `source_url` = `https://apply.workable.com/{slug}/j/{SHORTCODE}` (human-facing URL)

### Location format quirk

Location includes the workplace type in parentheses: `"Montreal, Canada (Hybrid)"`.
This string is stored as-is in the canonical `location` field. The `is_remote`
derivation rule matches against `(Remote)`, `(Hybrid)`, `(On-site)` to extract the
workplace mode, so no separate field is needed.

---

## Company slug discovery

The slug is the path component of the Workable careers page:
`https://apply.workable.com/{slug}/`

To check a slug and count open jobs:
```bash
curl -s "https://apply.workable.com/{slug}/llms.txt" | grep "current opening"
```

To get Canadian jobs:
```bash
curl -s "https://apply.workable.com/{slug}/jobs.md?location%5B0%5D%5Bcountry%5D=Canada"
```

---

## Known quirks

1. **No description available from the list endpoint** — `description_html` will always
   be `null` for Workable jobs. `tech_stack` is derived from `title` only.
2. **`Type` column is often `—`** — many postings omit employment type; `employment_type`
   will frequently be `null`.
3. **Location includes workplace type** — strip `(Hybrid)`, `(Remote)`, `(On-site)` if
   displaying location in the UI.
4. **`posted_at` is date-only** — stored as midnight UTC (`2026-05-01T00:00:00+00:00`).
5. **Country filter may miss remote-only postings** — some postings tagged as global
   remote won't appear with `location[0][country]=Canada`.

---

## Deduplication strategy

```
UNIQUE KEY: (source='workable', external_id=SHORTCODE, company_slug)
```

The shortcode (e.g. `BD055E1DA7`) is unique per company. Workable shortcodes are
uppercase hex strings, 8–10 characters.
