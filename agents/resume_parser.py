"""Resume parsing agent — resume text to structured candidate profile.

One Haiku call per resume, prompt-hash versioned exactly like the tech
extraction enricher (agents/enricher.py). Imported by
scripts/test_resume_parsing.py (dry-run, never writes) and, later, by the
on-demand fit-scoring flow.

Usage:
  python -m agents.resume_parser --file path/to/resume.txt
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
from typing import Literal, cast

import anthropic
import structlog
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from agents.prompt_utils import (
    compute_resume_parsing_prompt_hash,
    parse_resume_response,
    render_resume_parsing_prompt,
)

logger = structlog.get_logger()

_MAX_RETRIES = 3
_MAX_RESUME_CHARS = 6000

Seniority = Literal[
    "internship", "junior", "mid", "senior", "lead", "staff", "principal", "manager", "director"
]


class ParsedResume(BaseModel):
    skills: list[str] = Field(default_factory=list)
    seniority: Seniority | None = None
    years_experience: float | None = None
    remote_preference: Literal["remote", "hybrid", "onsite", "any"] = "any"
    preferred_locations: list[str] = Field(default_factory=list)
    role_keywords: list[str] = Field(default_factory=list)
    summary: str = ""


def _build_user_message(resume_text: str) -> str:
    text = resume_text.strip()
    if len(text) > _MAX_RESUME_CHARS:
        text = text[:_MAX_RESUME_CHARS] + "…"
    return f"Resume:\n{text}"


async def _call_with_retry(
    client: anthropic.AsyncAnthropic,
    model: str,
    system_prompt: str,
    user_message: str,
) -> tuple[ParsedResume, anthropic.types.Usage]:
    for attempt in range(_MAX_RETRIES):
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=1024,
                system=[
                    {"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}
                ],
                messages=[{"role": "user", "content": user_message}],
            )
            block = response.content[0]
            if not isinstance(block, anthropic.types.TextBlock):
                raise ValueError(f"unexpected content block type: {type(block)}")
            raw = parse_resume_response(block.text)
            return ParsedResume.model_validate(raw), response.usage
        except (anthropic.RateLimitError, anthropic.InternalServerError) as exc:
            if attempt < _MAX_RETRIES - 1:
                wait = 2 ** (attempt + 1)
                logger.warning("api_retry", attempt=attempt + 1, wait_s=wait, error=str(exc)[:80])
                await asyncio.sleep(wait)
            else:
                raise
    raise RuntimeError("unreachable")


async def parse_resume(resume_text: str) -> tuple[ParsedResume, str]:
    """Parse raw resume text into a structured profile.

    Returns (profile, prompt_hash). Makes exactly one Haiku call (plus
    retries on transient errors) — no DB access, no side effects.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")

    model = os.getenv("RESUME_PARSING_MODEL", "claude-haiku-4-5-20251001")
    system_prompt = render_resume_parsing_prompt()
    prompt_hash = compute_resume_parsing_prompt_hash()

    client = anthropic.AsyncAnthropic(api_key=api_key)
    user_message = _build_user_message(resume_text)

    profile, usage = await _call_with_retry(client, model, system_prompt, user_message)
    logger.info(
        "resume_parsed",
        prompt_hash=prompt_hash,
        model=model,
        skills=len(profile.skills),
        seniority=profile.seniority,
        cache_read=getattr(usage, "cache_read_input_tokens", 0) or 0,
    )
    return profile, prompt_hash


def persist_candidate_profile(profile: ParsedResume, prompt_hash: str) -> str:
    """Insert a parsed profile into candidate_profiles and return its id.

    Not used by scripts/test_resume_parsing.py — kept separate, with the
    Supabase import scoped inside this function, so the dry-run harness can
    import agents.resume_parser without ever touching the database. Mirrors
    agents.fit_scorer.run_and_persist()'s pattern.
    """
    from storage.supabase_client import get_client

    client = get_client()
    response = (
        client.table("candidate_profiles")
        .insert(
            {
                "skills": profile.skills,
                "seniority": profile.seniority,
                "preferences": {
                    "remote_preference": profile.remote_preference,
                    "preferred_locations": profile.preferred_locations,
                    "role_keywords": profile.role_keywords,
                    "summary": profile.summary,
                },
                "prompt_hash": prompt_hash,
            }
        )
        .execute()
    )
    return cast(str, cast(dict, response.data[0])["id"])


async def _main() -> None:
    parser = argparse.ArgumentParser(description="Parse a resume into a structured profile")
    parser.add_argument("--file", required=True, metavar="PATH", help="Path to a resume text file")
    args = parser.parse_args()

    resume_text = Path(args.file).read_text()
    profile, prompt_hash = await parse_resume(resume_text)
    print(json.dumps({"prompt_hash": prompt_hash, **profile.model_dump()}, indent=2))


if __name__ == "__main__":
    load_dotenv()
    asyncio.run(_main())
