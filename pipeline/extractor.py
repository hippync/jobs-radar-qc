"""Generic spec-driven extraction engine."""

from __future__ import annotations

import asyncio
import html
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import structlog
from lxml import etree

from agents.prompt_utils import is_non_tech_title

logger = structlog.get_logger()

SPECS_DIR = Path(__file__).parent.parent / "specs"

# Maximum number of concurrent detail-page requests (shared by Workable and Workday).
_WORKABLE_DETAIL_CONCURRENCY = 5
_WORKDAY_DETAIL_CONCURRENCY = 5
# Safety cap on Workday pagination — no single company should exceed this.
_WORKDAY_PAGINATION_CAP = 500


# ─── Spec loading ────────────────────────────────────────────────────────────


def _load_spec(source: str) -> tuple[dict, etree._Element]:
    spec_dir = SPECS_DIR / source
    schema = json.loads((spec_dir / "schema.json").read_text())
    root = etree.parse(str(spec_dir / "extraction.xml")).getroot()
    return schema, root


# ─── Value helpers ───────────────────────────────────────────────────────────


def _resolve_path(obj: Any, path: str) -> Any:
    """Dot-notation path into nested dict/list. Integer parts index lists."""
    for part in path.split("."):
        if obj is None:
            return None
        if isinstance(obj, list):
            try:
                obj = obj[int(part)]
            except (ValueError, IndexError):
                return None
        elif isinstance(obj, dict):
            obj = obj.get(part)
        else:
            return None
    return obj


def _coerce(value: Any, field_type: str, *, empty_as_null: bool = False) -> Any:
    if empty_as_null and value == "":
        return None
    if value is None:
        return None
    if field_type == "string":
        return str(value)
    if field_type == "datetime":
        try:
            return datetime.fromisoformat(str(value)).astimezone(UTC).isoformat()
        except (ValueError, TypeError):
            return None
    if field_type == "unix_ms":
        try:
            return datetime.fromtimestamp(int(value) / 1000, tz=UTC).isoformat()
        except (ValueError, TypeError):
            return None
    if field_type == "date":
        try:
            return datetime.strptime(str(value).strip(), "%Y-%m-%d").replace(tzinfo=UTC).isoformat()
        except (ValueError, TypeError):
            return None
    if field_type == "bool":
        if isinstance(value, bool):
            return value
        return str(value).lower() in ("true", "1", "yes")
    return value


def _parse_literal(s: str, field_type: str) -> Any:
    """Parse a string literal from an XML attribute into a typed Python value."""
    if s == "null":
        return None
    if field_type == "bool":
        return s == "true"
    if field_type.startswith("list"):
        return []
    return s


def _normalize_workday_date(date_str: str) -> str | None:
    """Normalise a Workday startDate to an ISO 8601 UTC string.

    Workday tenants emit dates in at least two formats:
      - "MM/DD/YYYY" (e.g. "04/28/2026")
      - ISO 8601 with or without timezone (e.g. "2026-04-28T00:00:00")
    """
    for fmt in ("%m/%d/%Y", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(date_str.strip(), fmt).replace(tzinfo=UTC).isoformat()
        except (ValueError, TypeError):
            pass
    try:
        return datetime.fromisoformat(date_str).astimezone(UTC).isoformat()
    except (ValueError, TypeError):
        return None


# ─── Derived field helpers ───────────────────────────────────────────────────


def _apply_match_rules(
    rules: list[etree._Element],
    job_data: dict,
    default: Any,
    field_type: str,
) -> Any:
    """First-match: return value for the first rule whose pattern matches."""
    for rule in rules:
        field_value = job_data.get(rule.get("source"))
        if field_value is None:
            continue
        if re.search(rule.get("pattern", ""), str(field_value)):
            return _parse_literal(rule.get("value", "null"), field_type)
    return default


def _strip_html_for_matching(text: str) -> str:
    """Strip HTML tags and collapse whitespace before keyword matching.

    Prevents false positives from tech names appearing inside HTML attributes
    (e.g. data-path-to-node triggering Node.js, class="java-btn" triggering Java).
    Decodes HTML entities first so that entity-encoded markup from Greenhouse
    (&lt;span data-is-last-node=...&gt;) is converted to real tags before stripping.
    """
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _with_word_boundary(pattern: str) -> str:
    """Prepend/append \\b where the pattern starts/ends with a word character.

    Skips positions already guarded by an explicit \\b in the pattern string.
    Handles special-char tech names correctly:
      - Java          → \\bJava\\b        (prevents matching inside "JavaScript")
      - C\\+\\+       → \\bC\\+\\+        (suffix omitted: + is non-word, boundary implicit)
      - \\.NET        → \\.NET\\b         (prefix omitted: starts with \\, not a word char)
      - \\bR\\b       → unchanged          (already fully guarded)
      - (?:Go|Golang) → \\b(?:Go|Golang)\\b (peeks inside leading (?:, trailing ))
    """
    if not pattern:
        return pattern
    # For patterns that start with a non-capturing group (?:...), peek at the
    # first character inside the group rather than the literal '(' character.
    effective_first = pattern[3] if pattern.startswith(r"(?:") and len(pattern) > 3 else pattern[0]
    prefix = (
        r"\b"
        if not pattern.startswith(r"\b") and re.match(r"[A-Za-z0-9_]", effective_first)
        else ""
    )
    # For patterns that end with a quantified closing paren — e.g. (?:ful)? or
    # (?:\.js)? — find the last word character inside the group rather than ')'.
    trailing = re.search(r"([A-Za-z0-9_])\)[?*+]?(?:\{[^}]*\})?$", pattern)
    effective_last = trailing.group(1) if trailing else pattern[-1]
    suffix = (
        r"\b" if not pattern.endswith(r"\b") and re.match(r"[A-Za-z0-9_]", effective_last) else ""
    )
    return f"{prefix}{pattern}{suffix}"


def _collect_keywords(kw_element: etree._Element | None, job_data: dict) -> list[str]:
    """Collect all keyword matches from the specified source fields."""
    if kw_element is None:
        return []
    sources = [s.strip() for s in kw_element.get("sources", "").split(",")]
    global_flags = re.IGNORECASE if kw_element.get("case_insensitive") == "true" else 0
    word_boundary = kw_element.get("word_boundary") == "true"
    # Strip HTML tags before searching to avoid false positives from attributes.
    text = " ".join(_strip_html_for_matching(str(job_data.get(s) or "")) for s in sources)
    results = []
    for kw in kw_element.findall("kw"):
        # case_sensitive="true" on a <kw> overrides the element-level case_insensitive flag.
        flags = 0 if kw.get("case_sensitive") == "true" else global_flags
        pattern = kw.text.strip()
        if word_boundary:
            pattern = _with_word_boundary(pattern)
        if re.search(pattern, text, flags):
            results.append(kw.get("canonical") or kw.text.strip())
    return results


# ─── Extractor ───────────────────────────────────────────────────────────────


class Extractor:
    def __init__(self, source: str) -> None:
        self.source = source
        self.schema, self.extraction = _load_spec(source)

    async def run(self) -> list[dict]:
        """Fetch and extract all jobs for all companies defined in the spec."""
        companies = self.schema["companies"]
        delay_s = (
            self.schema["endpoint"]["rate_limit"].get("delay_between_companies_ms", 200) / 1000
        )

        async with httpx.AsyncClient(
            headers={"User-Agent": "jobs-radar-qc/0.1"},
            follow_redirects=True,
        ) as client:
            all_jobs: list[dict] = []
            for i, company in enumerate(companies):
                if i > 0:
                    await asyncio.sleep(delay_s)
                all_jobs.extend(await self._fetch_company(client, company))

        logger.info("extraction_complete", source=self.source, total=len(all_jobs))
        return all_jobs

    async def _fetch_company(self, client: httpx.AsyncClient, company: dict) -> list[dict]:
        if self.source == "workday":
            return await self._fetch_workday_company(client, company)

        endpoint = self.schema["endpoint"]
        url = endpoint["url_template"].format(company_slug=company["slug"])
        log = logger.bind(source=self.source, company=company["name"])

        try:
            response = await client.get(url, params=endpoint.get("params", {}), timeout=30.0)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            log.warning("fetch_http_error", status=exc.response.status_code)
            return []
        except httpx.HTTPError as exc:
            log.error("fetch_failed", error=str(exc))
            return []

        if endpoint.get("response_format") == "markdown_table":
            raw_jobs = self._parse_markdown_table(response.text, endpoint.get("columns", []))
        else:
            jobs_path = endpoint.get("jobs_path")
            data = response.json()
            raw_jobs = data if jobs_path is None else data.get(jobs_path, [])

        # Source-specific pre-extraction enrichment (e.g. Workable detail-page fetch).
        # Must not make LLM calls — Layer 1 invariant.
        await self._enrich_raw_jobs(client, raw_jobs)

        required = self.schema.get("validation", {}).get("required_fields", [])

        results = []
        for raw_job in raw_jobs:
            if not all(raw_job.get(f) for f in required):
                log.debug("job_skipped_missing_fields", job_id=raw_job.get("id"))
                continue
            extracted = self._apply_extraction(raw_job, company)
            if is_non_tech_title(extracted.get("title", "")):
                log.debug("job_skipped_non_tech_title", title=extracted.get("title"))
                continue
            results.append(extracted)

        log.info("fetched", count=len(results))
        return results

    async def _enrich_raw_jobs(self, client: httpx.AsyncClient, raw_jobs: list[dict]) -> None:
        """Source-specific hook to enrich raw jobs before extraction.

        Called after the list response is parsed but before ``_apply_extraction``
        runs on each job. Must never make LLM calls (Layer 1 invariant).
        """
        if self.source == "workable":
            await self._fetch_workable_descriptions(client, raw_jobs)

    async def _fetch_workable_descriptions(
        self, client: httpx.AsyncClient, raw_jobs: list[dict]
    ) -> None:
        """Fetch each Workable job's ``.md`` detail page and inject ``description_html``.

        The list endpoint (``jobs.md``) does not include job descriptions; each row
        carries a ``_detail_url`` pointing to the full Markdown detail page
        (``https://apply.workable.com/{slug}/jobs/view/{SHORTCODE}.md``).

        Requests are bounded to ``_WORKABLE_DETAIL_CONCURRENCY`` concurrent fetches.
        A failed detail fetch is logged and the job continues with ``description_html``
        absent (the extraction XML falls back to the ``null`` constant so the job is
        still written to the DB — tech_stack will be title-only for that record).
        """
        sem = asyncio.Semaphore(_WORKABLE_DETAIL_CONCURRENCY)
        seen: set[str] = set()  # guard against duplicate shortcodes in the same run

        async def _fetch_one(raw_job: dict) -> None:
            detail_url: str | None = raw_job.get("_detail_url")
            # Guard against absent, relative, or already-seen URLs.
            if not detail_url or not detail_url.startswith("https://") or detail_url in seen:
                if detail_url and not detail_url.startswith("https://"):
                    logger.warning("workable_detail_url_not_absolute", url=detail_url)
                return
            seen.add(detail_url)

            async with sem:
                try:
                    resp = await client.get(detail_url, timeout=30.0)
                    resp.raise_for_status()
                    raw_job["description_html"] = resp.text
                    logger.debug(
                        "workable_detail_fetched",
                        url=detail_url,
                        bytes=len(resp.content),
                    )
                except httpx.HTTPStatusError as exc:
                    logger.warning(
                        "workable_detail_http_error",
                        url=detail_url,
                        status=exc.response.status_code,
                    )
                except httpx.HTTPError as exc:
                    logger.warning(
                        "workable_detail_fetch_failed",
                        url=detail_url,
                        error=str(exc),
                    )

        await asyncio.gather(*(_fetch_one(job) for job in raw_jobs))

    # ─── Workday ─────────────────────────────────────────────────────────────

    async def _fetch_workday_company(
        self, client: httpx.AsyncClient, company: dict
    ) -> list[dict]:
        """Fetch all jobs for a single Workday tenant using the CXS JSON API.

        Workday uses POST /jobs with offset-based pagination (20 jobs/page by default).
        Each company defines its own ``api_url`` and ``base_url`` in schema.json because
        Workday tenants have company-specific subdomains — there is no shared slug template.

        After the list is fetched and company context is injected into each raw job,
        detail pages are fetched concurrently to populate ``description_html`` and
        ``_posted_at``. A failed detail fetch is logged and the job is retained with
        ``description_html = null`` (title-only tech_stack extraction).
        """
        api_url = company.get("api_url", "")
        if not api_url:
            logger.warning("workday_missing_api_url", company=company["name"])
            return []

        log = logger.bind(source="workday", company=company["name"])
        endpoint = self.schema["endpoint"]
        request_body = dict(endpoint.get("request_body", {}))

        raw_jobs: list[dict] = []
        while True:
            request_body["offset"] = len(raw_jobs)
            try:
                response = await client.post(api_url, json=request_body, timeout=30.0)
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                log.warning("fetch_http_error", status=exc.response.status_code, url=api_url)
                break
            except httpx.HTTPError as exc:
                log.error("fetch_failed", error=str(exc), url=api_url)
                break

            data = response.json()
            batch = data.get("jobPostings", [])
            total = data.get("total", 0)
            raw_jobs.extend(batch)

            if not batch or len(raw_jobs) >= total:
                break
            if len(raw_jobs) >= _WORKDAY_PAGINATION_CAP:
                log.warning("workday_pagination_capped", total=total, fetched=len(raw_jobs))
                break

        # Inject company URL context so the detail fetcher and extraction XML can use it.
        # api_url ends with "/jobs"; strip that suffix to get the CXS api base.
        api_base = api_url.removesuffix("/jobs")
        base_url = company.get("base_url", "").rstrip("/")
        # The site name is the last path segment of the CXS api base
        # (e.g. "Desjardins" from ".../cxs/desjardins/Desjardins").
        # Workday's CXS API returns externalPath WITHOUT the site prefix
        # (e.g. "/job/Montreal/..." instead of "/Desjardins/job/Montreal/..."),
        # but the public career portal URL requires it.
        site = api_base.rstrip("/").rsplit("/", 1)[-1]
        for raw_job in raw_jobs:
            ext_path = raw_job.get("externalPath", "")
            raw_job["_api_base"] = api_base
            raw_job["_base_url"] = base_url
            raw_job["_external_id"] = raw_job.get("jobReqId") or (
                ext_path.rstrip("/").rsplit("/", 1)[-1] if ext_path else None
            )
            if base_url and ext_path:
                # Add site prefix if the API omitted it (the common case).
                public_path = (
                    ext_path if ext_path.startswith(f"/{site}") else f"/{site}{ext_path}"
                )
                raw_job["_source_url"] = base_url + public_path

        await self._fetch_workday_descriptions(client, raw_jobs)

        required = self.schema.get("validation", {}).get("required_fields", [])
        results = []
        for raw_job in raw_jobs:
            if not all(raw_job.get(f) for f in required):
                log.debug("job_skipped_missing_fields", job_id=raw_job.get("jobReqId"))
                continue
            extracted = self._apply_extraction(raw_job, company)
            if is_non_tech_title(extracted.get("title", "")):
                log.debug("job_skipped_non_tech_title", title=extracted.get("title"))
                continue
            results.append(extracted)

        log.info("fetched", count=len(results))
        return results

    async def _fetch_workday_descriptions(
        self, client: httpx.AsyncClient, raw_jobs: list[dict]
    ) -> None:
        """Fetch each Workday job's detail page and inject ``description_html``.

        The CXS detail URL is derived by stripping the leading ``/{site}`` prefix from
        ``externalPath`` and appending ``/details`` to the api base.  For example:

            api_base    = https://example.wd3.myworkdayjobs.com/wday/cxs/example/ExampleCareers
            externalPath = /ExampleCareers/job/Montreal/Engineer_JR-001
            detail URL  = api_base + /job/Montreal/Engineer_JR-001 + /details

        Requests are bounded to ``_WORKDAY_DETAIL_CONCURRENCY`` concurrent fetches.
        A failed detail fetch is logged and the job continues without a description.
        """
        sem = asyncio.Semaphore(_WORKDAY_DETAIL_CONCURRENCY)

        async def _fetch_one(raw_job: dict) -> None:
            api_base: str = raw_job.pop("_api_base", "")
            raw_job.pop("_base_url", None)
            ext_path: str = raw_job.get("externalPath", "")

            if not api_base or not ext_path:
                return

            site = api_base.rstrip("/").rsplit("/", 1)[-1]
            job_suffix = re.sub(rf"^/{re.escape(site)}", "", ext_path, count=1)
            detail_url = f"{api_base.rstrip('/')}{job_suffix}"

            async with sem:
                try:
                    resp = await client.get(detail_url, timeout=30.0)
                    resp.raise_for_status()
                    info = resp.json().get("jobPostingInfo", {})
                    description = info.get("jobDescription") or None
                    raw_job["description_html"] = description
                    start_date = info.get("startDate")
                    if start_date:
                        raw_job["_posted_at"] = _normalize_workday_date(start_date)
                    logger.debug(
                        "workday_detail_fetched",
                        url=detail_url,
                        bytes=len(resp.content),
                    )
                except httpx.HTTPStatusError as exc:
                    logger.warning(
                        "workday_detail_http_error",
                        url=detail_url,
                        status=exc.response.status_code,
                    )
                except httpx.HTTPError as exc:
                    logger.warning(
                        "workday_detail_fetch_failed",
                        url=detail_url,
                        error=str(exc),
                    )

        await asyncio.gather(*(_fetch_one(job) for job in raw_jobs))

    @staticmethod
    def _parse_markdown_table(text: str, columns: list[str]) -> list[dict]:
        """Parse a markdown pipe-table into a list of raw job dicts.

        Automatically extracts external_id and source_url from the _detail_url
        column (a Workable-specific convention). Cells with value '—' become None.
        Markdown link cells [text](url) are stored as the URL.
        """
        rows = []
        for line in text.splitlines():
            if not line.startswith("|"):
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) != len(columns):
                continue
            # Skip separator rows (---|--- pattern) and header rows
            if any(re.fullmatch(r"[-: ]+", c) for c in cells):
                continue
            if cells[0] == columns[0]:
                continue

            row: dict[str, Any] = {}
            for col, cell in zip(columns, cells, strict=False):
                link = re.fullmatch(r"\[([^\]]+)\]\(([^)]+)\)", cell)
                row[col] = link.group(2) if link else (None if cell == "—" else cell)

            # Derive external_id and source_url from the detail URL
            detail_url = row.get("_detail_url") or ""
            m = re.search(r"/view/([A-F0-9]+)\.md$", detail_url, re.IGNORECASE)
            if m:
                row["external_id"] = m.group(1)
                row["source_url"] = re.sub(r"/jobs/view/([A-F0-9]+)\.md$", r"/j/\1", detail_url)

            rows.append(row)
        return rows

    def _apply_extraction(self, raw_job: dict, company: dict) -> dict:
        result: dict[str, Any] = {
            "company": company["name"],
            "company_slug": company["slug"],
            "fetched_at": datetime.now(UTC).isoformat(),
        }

        # 1. Constants — fixed values stamped on every record
        for const in self.extraction.findall("constants/constant"):
            result[const.get("name")] = _parse_literal(
                const.get("value"), const.get("type", "string")
            )

        # 2. Direct field mappings from the raw API response
        for field in self.extraction.findall("fields/field"):
            raw_value = _resolve_path(raw_job, field.get("from"))
            field_type = field.get("type", "string")
            empty_as_null = field.get("empty_as_null") == "true"

            # Optional: concatenate sub-field from an array to the base value.
            # Used by Lever to append list sections (requirements, responsibilities)
            # to description_html so both deterministic extraction and LLM enrichment
            # see the full posting text.
            # XML: <field ... concat_array="lists" array_field="content" />
            concat_array = field.get("concat_array")
            if concat_array:
                array_data = _resolve_path(raw_job, concat_array)
                sub_key = field.get("array_field", "content")
                if isinstance(array_data, list):
                    extra = " ".join(
                        item.get(sub_key, "")
                        for item in array_data
                        if isinstance(item, dict) and item.get(sub_key)
                    )
                    base = str(raw_value) if raw_value is not None else ""
                    combined = f"{base} {extra}".strip()
                    raw_value = combined or None

            result[field.get("name")] = _coerce(raw_value, field_type, empty_as_null=empty_as_null)

        # 3. Derived fields — computed from already-mapped values in result
        for field in self.extraction.findall("derived/field"):
            name = field.get("name")
            field_type = field.get("type", "string")
            default = _parse_literal(field.get("default", "null"), field_type)

            if field.get("strategy") == "collect-all":
                result[name] = _collect_keywords(field.find("keywords"), result)
            else:
                result[name] = _apply_match_rules(
                    field.findall("match"), result, default, field_type
                )

        # Non-tech roles (paralegal, sales, HR…) must never carry tech_stack tags.
        # Mirrors the same gate in agents/enricher.py to prevent daily fetch from
        # re-polluting tech_stack after the enricher has cleared enriched_tech_stack.
        if is_non_tech_title(result.get("title", "")):
            result["tech_stack"] = []

        return result


# ─── Smoke test ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import pprint
    import sys

    async def _smoke_test() -> None:
        source = sys.argv[1] if len(sys.argv) > 1 else "greenhouse"
        extractor = Extractor(source)
        jobs = await extractor.run()
        print(f"\nExtracted {len(jobs)} jobs from '{source}'")
        if jobs:
            print("\nFirst job:")
            pprint.pprint(jobs[0])

    asyncio.run(_smoke_test())
