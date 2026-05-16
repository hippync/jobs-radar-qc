# Greenhouse — Source Documentation

## What is Greenhouse?

Greenhouse is an ATS (Applicant Tracking System) used by many mid-to-large tech companies.
It exposes a **public, unauthenticated Job Board API** for any company that has enabled it —
no API key required.

## API overview

**Base URL:**
```
https://boards-api.greenhouse.io/v1/boards/{company_slug}/jobs
```

**Method:** GET  
**Auth:** None (public endpoint)  
**Format:** JSON

### Key query parameters

| Param     | Effect                                                  |
|-----------|---------------------------------------------------------|
| `content` | `true` → include full HTML job description in response |

Always pass `content=true` — without it, `content` is omitted and we can't extract tech stack.

### Pagination

**There is no pagination.** The endpoint returns all open jobs for a company in a single
response, wrapped in a top-level `jobs` array. Typical company responses: 5–150 jobs.

### Rate limits

Greenhouse doesn't publish official limits. 5 requests/second per IP is a safe conservative
ceiling. We fetch all companies sequentially per run with a 0.2s delay between requests.

---

## Response structure

```json
{
  "jobs": [
    {
      "id": 4567890,
      "title": "Senior Backend Engineer",
      "updated_at": "2026-05-10T14:30:00-04:00",
      "absolute_url": "https://boards.greenhouse.io/coveo/jobs/4567890",
      "location": {
        "name": "Montréal, QC"
      },
      "departments": [
        { "id": 123, "name": "Engineering", "parent_id": null }
      ],
      "content": "<div><p>We are looking for...</p></div>",
      "metadata": []
    }
  ]
}
```

### Field notes

- **`id`** — integer, unique per company (not globally unique across Greenhouse). Use
  `(source, external_id)` as the composite dedup key, where `external_id = str(id)`.
- **`updated_at`** — ISO 8601 with timezone offset. Use as `posted_at`. Greenhouse doesn't
  expose a true `created_at` on the public board API; `updated_at` is the best proxy.
- **`location.name`** — free-text string, may be null, may contain multiple cities
  (e.g., "Montréal or Toronto"), or just "Remote".
- **`departments`** — array; take `departments[0].name`. Most jobs belong to one department,
  but some have multiple — we only capture the first.
- **`content`** — full HTML description; only present when `?content=true`. May be an empty
  string `""` — treat as null.
- **`absolute_url`** — canonical URL for the posting. Always present.
- **`metadata`** — custom fields configured per company; we ignore these (non-standard).

---

## Company slug discovery

The slug is the subdomain used in the company's Greenhouse board URL:
`https://boards.greenhouse.io/{slug}/jobs`

To verify a slug works:
```bash
curl -s "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs" | jq '.jobs | length'
```

A 200 response with `{"jobs": [...]}` confirms the slug is valid.  
A 404 or `{"error": "..."}` means the company doesn't use Greenhouse or the slug is wrong.

---

## Known quirks

1. **`content` can be `""`** — treat empty string as null, not as a description.
2. **`location` can be null** — some remote-only postings omit location entirely.
3. **`departments` can be `[]`** — don't fail if no department is present.
4. **`id` is an integer in JSON** — stringify it before storing as `external_id`.
5. **`updated_at` includes UTC offset** — parse with timezone awareness; store as UTC.
6. **The company slug is case-sensitive** — `Coveo` ≠ `coveo`; always use lowercase.

---

## Deduplication strategy

```
UNIQUE KEY: (source='greenhouse', external_id=str(job.id), company_slug)
```

On each fetch:
- If the key exists → update `last_seen_at`, re-derive fields, keep `first_seen_at`
- If the key is new → insert with `first_seen_at = fetched_at`
- After fetch → mark jobs not seen in this run as `is_active = false`
