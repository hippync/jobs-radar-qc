"""Shared utilities for prompt loading, hashing, and LLM response parsing.

Used by scripts/test_enrichment.py (Step 0) and agents/enricher.py (Step 1).
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

_PROMPT_PATH = Path(__file__).parent / "prompts" / "tech_extraction.md"
_CANONICAL_PATH = Path(__file__).parent.parent / "core" / "canonical_tech_stack.json"


def _load_canonical() -> dict:
    return json.loads(_CANONICAL_PATH.read_text())


def _format_canonical_list(canonical: dict) -> str:
    lines = []
    for category, techs in canonical["categories"].items():
        lines.append(f"{category}: {', '.join(techs)}")
    return "\n".join(lines)


def render_system_prompt() -> str:
    """Return the system prompt with the canonical tech list injected."""
    template = _PROMPT_PATH.read_text()
    canonical = _load_canonical()
    return template.replace("{{canonical_tech_list}}", _format_canonical_list(canonical))


def compute_prompt_hash() -> str:
    """SHA-256[:8] of the rendered system prompt (raw bytes, no normalization).

    Hash covers both the prompt template and the canonical list — changes to
    either will trigger re-enrichment of already-processed jobs.
    """
    rendered = render_system_prompt()
    return hashlib.sha256(rendered.encode()).hexdigest()[:8]


def strip_html(html: str) -> str:
    """Strip HTML tags and collapse whitespace. Returns plain text."""
    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text).strip()


def parse_llm_response(content: str) -> tuple[list[str], list[str]]:
    """Parse Claude's JSON response into (known, unknown) tech lists.

    known  = canonical technologies (no prefix)
    unknown = technologies prefixed with '?' in the response

    Raises ValueError if no valid JSON object is found.
    """
    json_match = re.search(r"\{.*\}", content, re.DOTALL)
    if not json_match:
        raise ValueError(f"no JSON object in response: {content[:120]!r}")

    data = json.loads(json_match.group())
    technologies = data.get("technologies")
    if not isinstance(technologies, list):
        raise ValueError(f"'technologies' key missing or not a list in: {data}")

    known: list[str] = []
    unknown: list[str] = []
    for item in technologies:
        if not isinstance(item, str):
            continue
        item = item.strip()
        if item.startswith("?"):
            unknown.append(item[1:].strip())
        else:
            known.append(item)

    return known, unknown
