# Lever — Source Documentation

## What is Lever?

Lever is an ATS used by many mid-size tech companies. Like Greenhouse, it exposes a
**public, unauthenticated postings API** for companies that have enabled it.

## API overview

**Base URL:**
```
https://api.lever.co/v0/postings/{company_slug}
```

**Method:** GET  
**Auth:** None (public endpoint)  
**Format:** JSON

### Key query parameters

| Param  | Effect                                                  |
|--------|---------------------------------------------------------|
| `mode` | `json` → return JSON array (default returns HTML page) |

Always pass `mode=json`.

### Response shape

Unlike Greenhouse, the response is a **bare JSON array** — not wrapped in an object:

```json
[
  { "id": "b67cd1d2-...", "text": "Senior Backend Engineer", ... },
  { "id": "a12bc3d4-...", "text": "Product Designer", ... }
]
```

### Pagination

Lever returns all open postings for a company in a single response (no pagination).
Typical company responses: 5–100 jobs.

### Rate limits

No official limits published. 5 requests/second is a safe ceiling.

---

## Response structure

```json
{
  "id": "b67cd1d2-d03b-41f1-b86d-578912345abc",
  "text": "Senior Backend Engineer",
  "hostedUrl": "https://jobs.lever.co/plusgrade/b67cd1d2-...",
  "applyUrl": "https://jobs.lever.co/plusgrade/b67cd1d2-.../apply",
  "createdAt": 1767130901531,
  "workplaceType": "hybrid",
  "categories": {
    "commitment": "Full-Time",
    "department": "Engineering",
    "location": "Montreal, Quebec",
    "team": "Platform",
    "allLocations": ["Montreal, Quebec"]
  },
  "description": "<div><p>We are looking for...</p></div>",
  "descriptionPlain": "We are looking for...",
  "lists": [
    { "text": "What you'll do", "content": "<li>..." }
  ],
  "additional": "",
  "additionalPlain": ""
}
```

### Field notes

- **`id`** — string UUID, globally unique within Lever. Safe to use alone as `external_id`.
- **`text`** — job title.
- **`hostedUrl`** — canonical link to the posting. Use as `source_url`.
- **`createdAt`** — Unix timestamp in **milliseconds** (not seconds). Use `unix_ms` type
  in extraction.xml to convert to UTC ISO 8601.
- **`workplaceType`** — structured remote signal: `"remote"`, `"hybrid"`, or `"on-site"`.
  Much more reliable for `is_remote` derivation than parsing free-text location strings.
- **`categories.location`** — primary location string. May be a city or region.
- **`categories.allLocations`** — array; use when a posting covers multiple locations.
- **`categories.department`** — organizational department (coarser than `team`).
- **`categories.commitment`** — employment type. Common values: `"Full-Time"`,
  `"Part-Time"`, `"Contractor - Consultant"`, `"Fixed-Term Employee"`, `"Internship"`.
- **`description`** — full HTML job description. May be empty string — treat as null.

---

## Company slug discovery

The slug is the path used on the company's Lever job board:
`https://jobs.lever.co/{slug}`

To verify a slug and get a job count:
```bash
curl -s "https://api.lever.co/v0/postings/{slug}?mode=json" | python3 -c \
  "import sys,json; jobs=json.load(sys.stdin); print(len(jobs), 'jobs')"
```

An empty array `[]` means the company has no open postings (not that the slug is wrong).
A JSON error object means the slug is invalid.

---

## Known quirks

1. **`createdAt` is milliseconds** — divide by 1000 before converting to a datetime.
2. **`description` can be `""`** — treat empty string as null.
3. **`workplaceType` may be absent** — older postings may not have this field.
4. **`categories.department` may be null** — not all companies fill it in.
5. **Response is a bare array** — set `jobs_path: null` in schema.json so the extractor
   treats the entire response as the job list.

---

## Deduplication strategy

```
UNIQUE KEY: (source='lever', external_id=job.id, company_slug)
```

Lever `id` values are UUIDs and globally unique, but we keep `company_slug` in the key
for consistency with other sources and to support efficient per-company `mark_inactive` queries.
