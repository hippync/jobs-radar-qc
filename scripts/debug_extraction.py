"""Debug extraction: show per-technology evidence for a single job URL.

Auto-detects the ATS from the URL — supports Lever, Greenhouse, and Workable.

Usage:
  python scripts/debug_extraction.py <job_url>

Examples:
  python scripts/debug_extraction.py https://jobs.lever.co/bhvr/b4582013-a93f-4b94-adef-1718407eaece
  python scripts/debug_extraction.py https://job-boards.eu.greenhouse.io/valtech/jobs/4850336101
  python scripts/debug_extraction.py https://apply.workable.com/tecsys/j/ABC123

For each extracted technology the report shows:
  - canonical name
  - source field (title / description_html)
  - matched text snippet (±40 chars around match)
  - raw pattern and effective pattern (with \\b anchors)
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import httpx
from lxml import etree

sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline.extractor import (
    Extractor,
    _coerce,
    _resolve_path,
    _strip_html_for_matching,
    _with_word_boundary,
)

SPECS_DIR = Path(__file__).parent.parent / "specs"
_HEADERS = {"User-Agent": "jobs-radar-qc/debug"}


# ─── ATS detection ───────────────────────────────────────────────────────────


def _detect_ats(url: str) -> tuple[str, str, str]:
    """Return (source, slug, job_id) inferred from the job URL."""
    patterns = [
        ("lever", r"(?:jobs\.lever\.co|api\.lever\.co/v0/postings)/([^/]+)/([^/?]+)"),
        ("greenhouse", r"(?:job-boards(?:\.eu)?\.greenhouse\.io"
                       r"|boards-api\.greenhouse\.io/v1/boards)/([^/]+)/jobs/([^/?]+)"),
        ("workable", r"apply\.workable\.com/([^/]+)/j/([^/?]+)"),
    ]
    for source, pat in patterns:
        m = re.search(pat, url)
        if m:
            return source, m.group(1), m.group(2)
    print(
        "Unrecognised URL — expected a Lever, Greenhouse, or Workable job URL.\n"
        f"Got: {url}\n\n"
        + __doc__
    )
    sys.exit(1)


# ─── Fetch strategies ────────────────────────────────────────────────────────


def _fetch_lever(slug: str, job_id: str) -> dict:
    url = f"https://api.lever.co/v0/postings/{slug}/{job_id}"
    resp = httpx.get(url, headers=_HEADERS, follow_redirects=True)
    resp.raise_for_status()
    return resp.json()


def _fetch_greenhouse(slug: str, job_id: str) -> dict:
    url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{job_id}"
    resp = httpx.get(url, headers=_HEADERS, params={"questions": "false"}, follow_redirects=True)
    resp.raise_for_status()
    return resp.json()


def _fetch_workable(slug: str, job_id: str) -> dict:
    schema = json.loads((SPECS_DIR / "workable" / "schema.json").read_text())
    endpoint = schema["endpoint"]
    url = endpoint["url_template"].format(company_slug=slug)
    resp = httpx.get(
        url, headers=_HEADERS, params=endpoint.get("params", {}), follow_redirects=True
    )
    resp.raise_for_status()
    rows = Extractor._parse_markdown_table(resp.text, endpoint["columns"])
    match = next(
        (r for r in rows if (r.get("external_id") or "").upper() == job_id.upper()),
        None,
    )
    if match is None:
        print(
            f"Job {job_id!r} not found in {slug}'s Workable listing.\n"
            "The job may be closed or filtered out by the Canada location param."
        )
        sys.exit(1)
    return match


def _fetch_job(source: str, slug: str, job_id: str) -> dict:
    fetchers = {
        "lever": _fetch_lever,
        "greenhouse": _fetch_greenhouse,
        "workable": _fetch_workable,
    }
    return fetchers[source](slug, job_id)


# ─── Extraction helpers ──────────────────────────────────────────────────────


def _load_spec(source: str) -> etree._Element:
    return etree.parse(str(SPECS_DIR / source / "extraction.xml")).getroot()


def _build_job_data(root: etree._Element, raw: dict) -> dict:
    """Reproduce the field-mapping step of _apply_extraction for any ATS."""
    result: dict = {}
    for field in root.findall("fields/field"):
        raw_value = _resolve_path(raw, field.get("from"))
        field_type = field.get("type", "string")
        empty_as_null = field.get("empty_as_null") == "true"

        concat_array = field.get("concat_array")
        if concat_array:
            array_data = _resolve_path(raw, concat_array)
            sub_key = field.get("array_field", "content")
            if isinstance(array_data, list):
                extra = " ".join(
                    item.get(sub_key, "")
                    for item in array_data
                    if isinstance(item, dict) and item.get(sub_key)
                )
                base = str(raw_value) if raw_value is not None else ""
                raw_value = f"{base} {extra}".strip() or None

        result[field.get("name")] = _coerce(raw_value, field_type, empty_as_null=empty_as_null)
    return result


def _debug_keywords(root: etree._Element, job_data: dict) -> list[dict]:
    """Run keyword matching and return debug records with evidence snippets."""
    kw_el = root.find(".//derived/field[@name='tech_stack']/keywords")
    if kw_el is None:
        return []

    sources = [s.strip() for s in kw_el.get("sources", "").split(",")]
    global_flags = re.IGNORECASE if kw_el.get("case_insensitive") == "true" else 0
    word_boundary = kw_el.get("word_boundary") == "true"

    source_texts = {
        s: _strip_html_for_matching(str(job_data.get(s) or "")) for s in sources
    }
    combined_text = " ".join(source_texts.values())

    records = []
    for kw in kw_el.findall("kw"):
        flags = 0 if kw.get("case_sensitive") == "true" else global_flags
        raw_pattern = kw.text.strip()
        pattern = _with_word_boundary(raw_pattern) if word_boundary else raw_pattern
        canonical = kw.get("canonical") or raw_pattern

        if not re.search(pattern, combined_text, flags):
            continue

        for src_name, src_text in source_texts.items():
            m = re.search(pattern, src_text, flags)
            if m:
                start = max(0, m.start() - 40)
                end = min(len(src_text), m.end() + 40)
                snippet = src_text[start:end].strip()
                records.append(
                    {
                        "canonical": canonical,
                        "source_field": src_name,
                        "snippet": f"...{snippet}...",
                        "method": "regex",
                        "pattern": raw_pattern,
                        "wb_pattern": pattern if pattern != raw_pattern else "(same)",
                    }
                )
                break

    return records


# ─── Display helpers ─────────────────────────────────────────────────────────


def _job_header(source: str, raw: dict, slug: str) -> tuple[str, str, str]:
    """Return (title, company, job_id) adapted to each ATS's raw field names."""
    if source == "lever":
        return (
            raw.get("text", "(no title)"),
            raw.get("categories", {}).get("company", slug),
            str(raw.get("id", "")),
        )
    if source == "greenhouse":
        return raw.get("title", "(no title)"), slug, str(raw.get("id", ""))
    # workable
    return raw.get("title", "(no title)"), slug, raw.get("external_id", "")


# ─── Entry point ─────────────────────────────────────────────────────────────


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    url = sys.argv[1]
    source, slug, job_id = _detect_ats(url)

    print(f"ATS:     {source}")
    print(f"Fetching {url}")
    raw = _fetch_job(source, slug, job_id)

    title, company, raw_id = _job_header(source, raw, slug)
    print(f"\nJob:     {title}")
    print(f"Company: {company}")
    print(f"ID:      {raw_id}")

    root = _load_spec(source)
    print(f"Spec:    specs/{source}/extraction.xml")

    job_data = _build_job_data(root, raw)
    records = _debug_keywords(root, job_data)

    if not records:
        print("\n[no technologies extracted]")
        return

    print(f"\n{'='*70}")
    print(f"{'TECH':<20} {'SOURCE':<20} {'METHOD':<8} SNIPPET")
    print(f"{'─'*70}")
    for r in records:
        print(f"{r['canonical']:<20} {r['source_field']:<20} {r['method']:<8} {r['snippet']}")
        if r["wb_pattern"] != "(same)":
            print(f"{'':20} pattern={r['pattern']!r}  →  effective={r['wb_pattern']!r}")
    print(f"{'='*70}")
    print(f"\nTotal: {len(records)} technologies extracted (deterministic)")
    print("\nNote: run the enricher with --dry-run to see what Claude would add.")


if __name__ == "__main__":
    main()
