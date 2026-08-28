"""Shared utilities for prompt loading, hashing, and LLM response parsing.

Used by scripts/test_enrichment.py (Step 0) and agents/enricher.py (Step 1),
and by their resume-parsing siblings (agents/resume_parser.py).
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import cast

# Titles that belong to non-technical functions — enrichment is skipped entirely.
# Covers common English and French patterns seen in Quebec postings.
_NON_TECH_TITLE_RE = re.compile(
    r"\b("
    r"paralegal|parajuriste"
    r"|legal\s+counsel|conseill(?:er|ère)\s+juridique|avocat(?:e)?"
    r"|notary|notaire"
    r"|recruiter|recruteur(?:euse)?|talent\s+acquisition"
    r"|human\s+resources|ressources?\s+humaines|hr\s+(?:manager|generalist|coordinator|business\s+partner)"
    r"|marketing\s+(?:coordinator|manager|specialist|analyst|director)"
    r"|coordonnateur(?:trice)?\s+marketing"
    r"|media\s+(?:manager|buyer|planner|specialist|strategist)"
    r"|gestionnaire\s+des?\s+m[eé]dias"
    r"|responsable\s+(?:marketing|m[eé]dias|communication|contenu)"
    r"|sp[eé]cialiste\s+(?:marketing|m[eé]dias|publicit[eé]|communication)"
    r"|direct(?:eur|rice)\s+(?:marketing|m[eé]dias|communication)"
    r"|achet(?:eur|euse)\s+m[eé]dias|planificat(?:eur|rice)\s+m[eé]dias"
    r"|sales\s+(?:representative|rep|executive|manager|director|coordinator)"
    r"|account\s+executive|account\s+manager|représentant(?:e)?\s+(?:des\s+ventes|commercial(?:e)?)"
    r"|finance\s+(?:manager|analyst|director|coordinator)"
    r"|accountant|comptable|controller|bookkeeper"
    r"|administrative\s+(?:assistant|coordinator)|assistant(?:e)?\s+administratif(?:ve)?"
    r"|receptionist|réceptionniste"
    r")\b",
    re.IGNORECASE,
)


def is_non_tech_title(title: str) -> bool:
    """Return True if the job title clearly belongs to a non-technical function.

    Used as a pre-filter gate before the LLM call to avoid false positives and
    save API cost on roles like paralegal, sales, HR, marketing, etc.
    """
    return bool(_NON_TECH_TITLE_RE.search(title))


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


_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def _extract_json_object(content: str) -> dict:
    """Find and parse the first JSON object in a Claude text response.

    Raises ValueError if no valid JSON object is found. Shared by every
    parse_*_response function below — none of them do field-level validation,
    that's each caller's Pydantic model's job.
    """
    json_match = _JSON_OBJECT_RE.search(content)
    if not json_match:
        raise ValueError(f"no JSON object in response: {content[:120]!r}")
    return cast(dict, json.loads(json_match.group()))


def parse_llm_response(content: str) -> tuple[list[str], list[str]]:
    """Parse Claude's JSON response into (known, unknown) tech lists.

    known  = canonical technologies (no prefix)
    unknown = technologies prefixed with '?' in the response

    Raises ValueError if no valid JSON object is found.
    """
    data = _extract_json_object(content)
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


# ─── Resume parsing (agents/resume_parser.py) ─────────────────────────────────

_RESUME_PROMPT_PATH = Path(__file__).parent / "prompts" / "resume_parsing.md"


def render_resume_parsing_prompt() -> str:
    """Return the resume-parsing system prompt with the canonical tech list injected."""
    template = _RESUME_PROMPT_PATH.read_text()
    canonical = _load_canonical()
    return template.replace("{{canonical_tech_list}}", _format_canonical_list(canonical))


def compute_resume_parsing_prompt_hash() -> str:
    """SHA-256[:8] of the rendered resume-parsing prompt (raw bytes, no normalization).

    Hash covers both the prompt template and the canonical list — changes to
    either invalidate stored candidate_profiles.prompt_hash values.
    """
    rendered = render_resume_parsing_prompt()
    return hashlib.sha256(rendered.encode()).hexdigest()[:8]


def parse_resume_response(content: str) -> dict:
    """Parse Claude's JSON response into a raw candidate profile dict.

    Raises ValueError if no valid JSON object is found. Field-level validation
    (types, enum membership) is the caller's job via agents.resume_parser.ParsedResume.
    """
    return _extract_json_object(content)


# ─── Fit scoring (agents/fit_scorer.py) ───────────────────────────────────────

_FIT_SCORING_PROMPT_PATH = Path(__file__).parent / "prompts" / "fit_scoring.md"


def render_fit_scoring_prompt() -> str:
    """Return the fit-scoring system prompt. No template placeholders — the
    job/profile/criteria are passed in the user message per call, not baked
    into the system prompt."""
    return _FIT_SCORING_PROMPT_PATH.read_text()


def compute_fit_scoring_prompt_hash() -> str:
    """SHA-256[:8] of the fit-scoring system prompt.

    Stored per row in job_matches.prompt_hash — changing the prompt
    invalidates the comparability of previously stored scores.
    """
    rendered = render_fit_scoring_prompt()
    return hashlib.sha256(rendered.encode()).hexdigest()[:8]


def parse_fit_score_response(content: str) -> dict:
    """Parse Claude's JSON response into a raw {score, reasons} dict.

    Raises ValueError if no valid JSON object is found. Field-level validation
    is the caller's job via agents.fit_scorer.FitScoreResult.
    """
    return _extract_json_object(content)
