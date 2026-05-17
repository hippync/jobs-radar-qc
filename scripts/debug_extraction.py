"""Debug extraction: show per-technology evidence for a single Lever job URL.

Usage:
  python scripts/debug_extraction.py <lever_job_url>
  python scripts/debug_extraction.py https://api.lever.co/v0/postings/bhvr/b4582013-a93f-4b94-adef-1718407eaece
  python scripts/debug_extraction.py https://jobs.lever.co/bhvr/b4582013-a93f-4b94-adef-1718407eaece

For each extracted technology the report shows:
  - canonical name
  - source field (title / description_html)
  - matched text snippet (±40 chars around match)
  - extraction method (regex)
  - pattern used
  - extraction spec version

Output format: plain text, one block per technology.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import httpx
from lxml import etree

# Allow running from repo root without installing the package.
sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline.extractor import _resolve_path, _coerce, _strip_html_for_matching, _with_word_boundary

SPECS_DIR = Path(__file__).parent.parent / "specs"


def _fetch_job(url: str) -> dict:
    """Accept either a hosted URL or a direct API URL and return the raw job dict."""
    # Convert hosted URL to API URL
    # https://jobs.lever.co/{slug}/{id} → https://api.lever.co/v0/postings/{slug}/{id}
    url = re.sub(
        r"https://jobs\.lever\.co/([^/]+)/([^/?]+)",
        r"https://api.lever.co/v0/postings/\1/\2",
        url,
    )
    resp = httpx.get(url, headers={"User-Agent": "jobs-radar-qc/debug"}, follow_redirects=True)
    resp.raise_for_status()
    return resp.json()


def _build_job_data(raw: dict) -> dict:
    """Reproduce the field mapping step of _apply_extraction for Lever."""
    spec_dir = SPECS_DIR / "lever"
    root = etree.parse(str(spec_dir / "extraction.xml")).getroot()

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
                combined = f"{base} {extra}".strip()
                raw_value = combined or None

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

    # Per-source plain text for snippet extraction
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

        # Find which source field and what snippet
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


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    url = sys.argv[1]
    print(f"Fetching: {url}")
    raw = _fetch_job(url)

    title = raw.get("text", "(no title)")
    company = raw.get("categories", {}).get("company", "")
    print(f"\nJob:     {title}")
    if company:
        print(f"Company: {company}")
    print(f"ID:      {raw.get('id')}")

    spec_dir = SPECS_DIR / "lever"
    root = etree.parse(str(spec_dir / "extraction.xml")).getroot()
    spec_version = root.get("version", "?")
    print(f"Spec:    specs/lever/extraction.xml  version={spec_version}")

    job_data = _build_job_data(raw)
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
