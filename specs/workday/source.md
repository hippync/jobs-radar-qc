# Workday — Source Documentation

## What is Workday?

Workday is an enterprise HR/ATS platform used by banks, insurance companies, telcos,
universities, and large tech employers. Unlike Greenhouse and Lever, Workday has no
shared public API hostname — each company operates its own tenant on a company-specific
subdomain (`{tenant}.wd{N}.myworkdayjobs.com`).

## API overview

Workday exposes a public, unauthenticated **CXS JSON API** on every tenant for reading
job listings. This is the same API that powers the Workday public career portal.

### List endpoint

**URL:** `https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs`  
**Method:** POST  
**Auth:** None (public endpoint)  
**Content-Type:** `application/json`

```json
{
  "appliedFacets": {},
  "limit": 20,
  "offset": 0,
  "searchText": ""
}
```

The response includes `total` (total matching jobs) and `jobPostings` (current page).
The extractor paginates automatically until all jobs are fetched, capped at 500.

### Detail endpoint

**URL:** `https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/job/{job-path}`  
**Method:** GET  
**Auth:** None

The `{job-path}` portion is derived by stripping the leading `/{site}` prefix from
the list response's `externalPath` field (if that prefix is present). Most real
tenants return `externalPath` values that already start with `/job/…` and carry no
site prefix, so no stripping is needed and the path is used verbatim. Example:

```
externalPath = "/job/Montreal/Cloud-Engineer_JR-2000"   (no site prefix)
api_base     = https://example.wd3.myworkdayjobs.com/wday/cxs/example/ExampleCareers
detail URL   = https://example.wd3.myworkdayjobs.com/wday/cxs/example/ExampleCareers
               /job/Montreal/Cloud-Engineer_JR-2000
```

Note: an older variant of the Workday CXS API appended `/details` to this URL. That
suffix was removed because real tenants return 422 when it is present — the
path-only URL is the correct and universally supported form.

The detail response contains:
- `jobPostingInfo.jobDescription` — full HTML job description (maps to `description_html`)
- `jobPostingInfo.startDate` — posting date (maps to `posted_at`, normalised to ISO UTC)

---

## Schema entry per company

Because each Workday tenant has a unique hostname, each company in `schema.json` requires
two URL fields instead of a simple slug:

```json
{
  "name": "Example Corp",
  "slug": "example-corp",
  "api_url": "https://example.wd3.myworkdayjobs.com/wday/cxs/example/ExampleCareers/jobs",
  "base_url": "https://example.wd3.myworkdayjobs.com"
}
```

| Field      | Purpose                                                         |
|------------|-----------------------------------------------------------------|
| `name`     | Display name — stored in canonical `company` field             |
| `slug`     | Machine-readable identifier for dedup and logging              |
| `api_url`  | Full CXS `/jobs` endpoint URL (POST target)                    |
| `base_url` | Tenant domain root — used to construct human-facing source_url |

The human-facing `source_url` is: `base_url + externalPath`  
(e.g., `https://example.wd3.myworkdayjobs.com/ExampleCareers/job/Montreal/Engineer_JR-001`)

---

## Tenant/URL discovery

To find a company's Workday tenant:

1. **From the careers page URL:** If the company links to
   `https://company.wd3.myworkdayjobs.com/...`, the tenant is `company` and `N=3`.
2. **From LinkedIn/job boards:** Job postings often link to the Workday tenant directly.
3. **Verification:**
   ```bash
   curl -s -X POST \
     "https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs" \
     -H "Content-Type: application/json" \
     -d '{"appliedFacets":{},"limit":1,"offset":0,"searchText":""}' | jq '.total'
   ```
   A numeric `total` confirms the endpoint is live.

### Workday version (wd1 through wd5)

Workday assigns tenants to different infrastructure versions (`wd1`, `wd2`, `wd3`, `wd5`).
The version is embedded in the tenant hostname. Always use the correct version from the
company's actual careers page URL — the CXS API path is identical across versions.

---

## List response structure

```json
{
  "total": 45,
  "jobPostings": [
    {
      "title": "Cloud Engineer",
      "externalPath": "/BellCareers/job/Montreal-Quebec/Cloud-Engineer_JR-2000",
      "locationsText": "Montréal, Quebec, Canada",
      "postedOn": "Posted 3 Days Ago",
      "jobReqId": "JR-2000",
      "bulletFields": ["Full time", "JR-2000"]
    }
  ]
}
```

### Field notes

| Field          | Canonical mapping     | Notes                                                       |
|----------------|-----------------------|-------------------------------------------------------------|
| `title`        | `title`               | Raw job title                                               |
| `externalPath` | derives `external_id`, `source_url`, detail URL | Always present; company-unique |
| `locationsText`| `location`            | Free-text, e.g. `"Montréal, Quebec, Canada"`               |
| `postedOn`     | ignored               | Relative string ("Posted 3 Days Ago") — use detail `startDate` instead |
| `jobReqId`     | `external_id` (preferred) | e.g. `JR-2000`; falls back to last path segment if absent |
| `bulletFields` | ignored               | Truncated bullets; full description comes from detail fetch |

---

## Field injection (pre-extraction enrichment)

Before the extraction XML runs, `_fetch_workday_company` injects:

| Injected key      | Source                                      |
|-------------------|---------------------------------------------|
| `_external_id`    | `jobReqId` if present, else last path segment of `externalPath` |
| `_source_url`     | `base_url + externalPath`                   |
| `description_html`| `jobPostingInfo.jobDescription` from detail endpoint |
| `_posted_at`      | `jobPostingInfo.startDate` (normalised to ISO UTC) |

---

## Pagination

The CXS API returns 20 jobs per page by default. The extractor fetches successive pages
(incrementing `offset`) until `len(fetched) >= total`. A safety cap of 500 jobs per
company prevents runaway loops. Companies with >500 open jobs are logged with a warning.

---

## Detail-fetch strategy

All detail pages for a company's jobs are fetched concurrently, bounded to 5 simultaneous
requests (same semaphore as Workable). A failed detail fetch is logged and the job is still
upserted with `description_html = null`; `tech_stack` falls back to title-only.

---

## Known quirks and unsupported variants

1. **`startDate` format varies by tenant** — some return `"MM/DD/YYYY"`, others return
   ISO 8601. The normaliser tries both formats before giving up.
2. **`jobReqId` may be absent** — some tenants omit this field. The fallback extracts
   the last path segment of `externalPath` as `external_id`.
3. **`locationsText` can list multiple cities** — e.g. `"Montréal or Toronto, Canada"`.
   The `is_qc` derivation still fires if any Quebec city appears in the string.
4. **No built-in location filter** — unlike Workable (which has `location[0][country]`),
   the Workday CXS API does not reliably support location-based facets across all tenants.
   We fetch all jobs and rely on the `is_qc` derivation rule to filter.
5. **`appliedFacets` location filtering** — some tenants support location facets via
   `appliedFacets`, but the facet keys are tenant-specific and not discoverable without
   a prior facets request. Not implemented in this version.
6. **JavaScript-rendered career portals** — some Workday tenants are configured with a
   custom front-end and do not expose the standard CXS endpoint. These are incompatible
   with this adapter and must be skipped; symptoms: 404 or HTML response from POST /jobs.

---

## Deduplication strategy

```
UNIQUE KEY: (source='workday', external_id, company_slug)
```

`external_id` is `jobReqId` when present, else the last path segment of `externalPath`.
Both are stable across fetches for the same job posting.

---

## Company rollout

The Quebec Workday company list is managed in issue #75. This file documents the adapter
mechanics. See #75 for the validated list of tenant URLs.
