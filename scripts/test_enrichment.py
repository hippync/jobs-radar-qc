"""Dry-run tech stack enrichment script.

Loads jobs (from Supabase or a local fixture), calls Claude, and prints a
side-by-side comparison of rule-based vs LLM tech stacks. No DB writes
unless both --write and --confirm are passed.

Usage:
  # Offline — fixture only, no API key needed for DB
  python -m scripts.test_enrichment --fixture tests/fixtures/sample_jobs.json

  # Live Supabase, dry-run
  python -m scripts.test_enrichment --sample 20 --source greenhouse

  # Write results to DB (Step 1+)
  python -m scripts.test_enrichment --sample 20 --write --confirm
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import structlog
from dotenv import load_dotenv

from agents.prompt_utils import compute_prompt_hash, parse_llm_response, render_system_prompt, strip_html

load_dotenv()
logger = structlog.get_logger()

_MAX_DESC_CHARS = 2000


def _load_from_fixture(path: str, sample: int | None, source: str | None) -> list[dict]:
    jobs: list[dict] = json.loads(Path(path).read_text())
    if source:
        jobs = [j for j in jobs if j.get("source") == source]
    if sample:
        jobs = jobs[:sample]
    return jobs


def _load_from_supabase(sample: int, source: str | None) -> list[dict]:
    from storage.supabase_client import get_client

    client = get_client()
    query = (
        client.table("jobs")
        .select("id, title, description_html, tech_stack, source, company, source_url")
        .eq("is_active", True)
        .eq("is_qc", True)
    )
    if source:
        query = query.eq("source", source)
    response = query.limit(sample).execute()
    return response.data or []


def _call_claude(client, model: str, system_prompt: str, job: dict) -> tuple[list[str], list[str]]:
    description = job.get("description_html") or ""
    if description:
        description = strip_html(description)
        if len(description) > _MAX_DESC_CHARS:
            description = description[:_MAX_DESC_CHARS] + "…"
    else:
        description = "(no description available)"

    user_message = f"Title: {job['title']}\n\nDescription:\n{description}"

    response = client.messages.create(
        model=model,
        max_tokens=512,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )
    return parse_llm_response(response.content[0].text)


def _format_diff(rule_based: list[str], llm_known: list[str]) -> str:
    rule_set = set(rule_based)
    llm_set = set(llm_known)
    added = sorted(llm_set - rule_set)
    removed = sorted(rule_set - llm_set)
    parts = [f"+{t}" for t in added] + [f"-{t}" for t in removed]
    return "  ".join(parts) if parts else "(no diff)"


def _write_to_db(results: list[dict], prompt_hash: str) -> None:
    from storage.supabase_client import get_client

    client = get_client()
    now = datetime.now(timezone.utc).isoformat()
    for r in results:
        client.table("jobs").update(
            {
                "enriched_tech_stack": r["known"],
                "enriched_at": now,
                "enriched_prompt_hash": prompt_hash,
            }
        ).eq("id", r["job"]["id"]).execute()
    print(f"Written {len(results)} enrichment results to DB.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Dry-run tech stack enrichment")
    parser.add_argument("--sample", type=int, default=10, metavar="N",
                        help="Number of jobs to process (default: 10)")
    parser.add_argument("--source", choices=["greenhouse", "lever", "workable"],
                        help="Filter by ATS source")
    parser.add_argument("--fixture", metavar="PATH",
                        help="Load jobs from a local JSON fixture instead of Supabase")
    parser.add_argument("--write", action="store_true",
                        help="Write LLM results to DB (requires --confirm)")
    parser.add_argument("--confirm", action="store_true",
                        help="Required with --write to confirm production writes")
    args = parser.parse_args()

    if args.write and not args.confirm:
        print("ERROR: --write requires --confirm. Use both flags to write to DB.", file=sys.stderr)
        sys.exit(1)

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY is not set.", file=sys.stderr)
        sys.exit(1)

    model = os.getenv("ENRICHMENT_MODEL", "claude-haiku-4-5-20251001")

    if args.fixture:
        jobs = _load_from_fixture(args.fixture, args.sample, args.source)
    else:
        jobs = _load_from_supabase(args.sample, args.source)

    if not jobs:
        print("No jobs found.")
        sys.exit(0)

    system_prompt = render_system_prompt()
    prompt_hash = compute_prompt_hash()

    print(f"\nEnrichment dry-run")
    print(f"  Model       : {model}")
    print(f"  Prompt hash : {prompt_hash}")
    print(f"  Jobs        : {len(jobs)}")
    if args.fixture:
        print(f"  Source      : fixture ({args.fixture})")
    else:
        print(f"  Source      : Supabase" + (f" (filter: {args.source})" if args.source else ""))
    print(f"  Mode        : {'WRITE' if args.write else 'dry-run (read-only)'}")
    print()

    if args.write and args.confirm:
        # ~$0.00025 per job for Haiku (system + ~500 token description)
        estimated_cost = len(jobs) * 0.00025
        answer = input(
            f"  About to enrich {len(jobs)} jobs. Est. cost: ~${estimated_cost:.2f}. Continue? [y/N] "
        )
        if answer.strip().lower() != "y":
            print("Aborted.")
            sys.exit(0)
        print()

    import anthropic
    client = anthropic.Anthropic(api_key=api_key)

    results: list[dict] = []
    errors = 0

    for job in jobs:
        title = job.get("title", "Unknown")
        company = job.get("company", "Unknown")
        rule_based = job.get("tech_stack") or []

        try:
            known, unknown = _call_claude(client, model, system_prompt, job)
            diff = _format_diff(rule_based, known)

            print(f"[{company}] {title}")
            print(f"  rule-based : {', '.join(sorted(rule_based)) or '(none)'}")
            print(f"  LLM known  : {', '.join(sorted(known)) or '(none)'}")
            if unknown:
                print(f"  LLM ?new   : {', '.join(sorted(unknown))}")
            print(f"  diff       : {diff}")
            print()

            results.append({"job": job, "known": known, "unknown": unknown})

        except Exception as exc:
            errors += 1
            logger.warning("enrichment_failed", company=company, title=title, error=str(exc))
            print(f"[{company}] {title}")
            print(f"  ERROR: {exc}")
            print()

    total_new = sum(
        len(set(r["known"]) - set(r["job"].get("tech_stack") or []))
        for r in results
    )
    print(f"Summary: {len(results)} enriched, {errors} errors, {total_new} new tech signals found.")

    if args.write and args.confirm and results:
        _write_to_db(results, prompt_hash)


if __name__ == "__main__":
    main()
