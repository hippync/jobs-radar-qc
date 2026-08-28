"""Dry-run resume parsing script.

Parses one resume (--file) or a fixture of resumes (--fixture) and prints the
structured profile. Never writes to a database — this module does not import
storage.supabase_client, so that's structurally guaranteed, not just
flag-gated.

Usage:
  # Single resume, plain text file
  python -m scripts.test_resume_parsing --file tests/fixtures/resumes/junior.txt

  # Fixture of resumes, optionally with golden "expected" profiles to diff against
  python -m scripts.test_resume_parsing --fixture tests/fixtures/resumes.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import structlog
from dotenv import load_dotenv

from agents.prompt_utils import (
    compute_resume_parsing_prompt_hash,
    parse_resume_response,
    render_resume_parsing_prompt,
)
from agents.resume_parser import ParsedResume

load_dotenv()
logger = structlog.get_logger()

_MAX_RESUME_CHARS = 6000


def _load_from_fixture(path: str) -> list[dict]:
    return json.loads(Path(path).read_text())


def _call_claude(client, model: str, system_prompt: str, resume_text: str) -> ParsedResume:
    text = resume_text.strip()
    if len(text) > _MAX_RESUME_CHARS:
        text = text[:_MAX_RESUME_CHARS] + "…"
    user_message = f"Resume:\n{text}"
    response = client.messages.create(
        model=model,
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )
    raw = parse_resume_response(response.content[0].text)
    return ParsedResume.model_validate(raw)


def _format_diff(expected: dict, actual: ParsedResume) -> str:
    lines = []
    for field, exp_val in expected.items():
        act_val = getattr(actual, field, None)
        if isinstance(exp_val, list):
            exp_set, act_set = set(exp_val), set(act_val or [])
            if exp_set != act_set:
                added = sorted(act_set - exp_set)
                missing = sorted(exp_set - act_set)
                parts = [f"+{v}" for v in added] + [f"-{v}" for v in missing]
                lines.append(f"    {field}: {'  '.join(parts)}")
        elif exp_val != act_val:
            lines.append(f"    {field}: expected={exp_val!r} actual={act_val!r}")
    return "\n".join(lines) if lines else "    (matches expected)"


def main() -> None:
    parser = argparse.ArgumentParser(description="Dry-run resume parsing")
    parser.add_argument("--file", metavar="PATH", help="Parse a single plain-text resume file")
    parser.add_argument(
        "--fixture", metavar="PATH", help="Parse a JSON fixture of {name, text, expected?} entries"
    )
    args = parser.parse_args()

    if not args.file and not args.fixture:
        print("ERROR: pass --file or --fixture.", file=sys.stderr)
        sys.exit(1)

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY is not set.", file=sys.stderr)
        sys.exit(1)

    model = os.getenv("RESUME_PARSING_MODEL", "claude-haiku-4-5-20251001")
    system_prompt = render_resume_parsing_prompt()
    prompt_hash = compute_resume_parsing_prompt_hash()

    entries: list[dict]
    if args.file:
        entries = [{"name": Path(args.file).name, "text": Path(args.file).read_text()}]
    else:
        entries = _load_from_fixture(args.fixture)

    print("\nResume parsing dry-run")
    print(f"  Model       : {model}")
    print(f"  Prompt hash : {prompt_hash}")
    print(f"  Resumes     : {len(entries)}")
    print()

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)

    errors = 0
    for entry in entries:
        name = entry.get("name", "resume")
        try:
            profile = _call_claude(client, model, system_prompt, entry["text"])
            print(f"[{name}]")
            print(json.dumps(profile.model_dump(), indent=2))
            if "expected" in entry:
                print("  diff vs expected:")
                print(_format_diff(entry["expected"], profile))
            print()
        except Exception as exc:
            errors += 1
            logger.warning("resume_parse_failed", name=name, error=str(exc))
            print(f"[{name}]")
            print(f"  ERROR: {exc}")
            print()

    print(f"Summary: {len(entries) - errors} parsed, {errors} errors.")


if __name__ == "__main__":
    main()
