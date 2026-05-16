"""Tech stack enrichment agent — Greenhouse + Lever.

Reads jobs that haven't been enriched with the current prompt version,
calls Claude Haiku, and writes enriched_tech_stack to DB.

Sequential with 1.2 s delay between requests to stay under Tier 1 limits
(50 RPM). Retries up to 3× on 429 / 5xx with exponential backoff. A
per-job failure never aborts the run — failed jobs are marked as attempted
so the same broken description doesn't burn retries on every daily run.

Usage:
  python -m agents.enricher              # enrich all pending jobs
  python -m agents.enricher --dry-run    # print counts, no API calls
  python -m agents.enricher --limit 50   # cap at N jobs per run
"""
from __future__ import annotations

import argparse
import asyncio
import os
from datetime import datetime, timezone

import anthropic
import structlog
from dotenv import load_dotenv

from agents.prompt_utils import compute_prompt_hash, parse_llm_response, render_system_prompt, strip_html
from storage.supabase_client import get_client

logger = structlog.get_logger()

_SOURCES = ["greenhouse", "lever"]
_MAX_DESC_CHARS = 2000
_REQUEST_DELAY_S = 1.2
_MAX_RETRIES = 3


# ─── DB helpers ──────────────────────────────────────────────────────────────


def _load_pending(prompt_hash: str, limit: int) -> list[dict]:
    """Return active GH/Lever jobs not yet enriched with this prompt version."""
    client = get_client()
    response = (
        client.table("jobs")
        .select("id, title, description_html, tech_stack, source, company")
        .eq("is_active", True)
        .in_("source", _SOURCES)
        # include both NULL (never enriched) and stale hash (prompt changed)
        .or_(f"enriched_prompt_hash.is.null,enriched_prompt_hash.neq.{prompt_hash}")
        .order("first_seen_at", desc=False)
        .limit(limit)
        .execute()
    )
    return response.data or []


def _write_results(results: list[dict]) -> None:
    client = get_client()
    now = datetime.now(timezone.utc).isoformat()
    for r in results:
        client.table("jobs").update(
            {
                "enriched_tech_stack": r["known"],
                "enriched_at": now,
                "enriched_prompt_hash": r["prompt_hash"],
            }
        ).eq("id", r["id"]).execute()


# ─── Claude helpers ──────────────────────────────────────────────────────────


def _build_user_message(job: dict) -> str:
    raw = job.get("description_html") or ""
    if raw:
        text = strip_html(raw)
        if len(text) > _MAX_DESC_CHARS:
            text = text[:_MAX_DESC_CHARS] + "…"
    else:
        text = "(no description available)"
    return f"Title: {job['title']}\n\nDescription:\n{text}"


async def _call_with_retry(
    client: anthropic.AsyncAnthropic,
    model: str,
    system_prompt: str,
    user_message: str,
) -> tuple[list[str], list[str]]:
    for attempt in range(_MAX_RETRIES):
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=512,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            return parse_llm_response(response.content[0].text)
        except (anthropic.RateLimitError, anthropic.InternalServerError) as exc:
            if attempt < _MAX_RETRIES - 1:
                wait = 2 ** (attempt + 1)
                logger.warning("api_retry", attempt=attempt + 1, wait_s=wait, error=str(exc)[:80])
                await asyncio.sleep(wait)
            else:
                raise


# ─── Main ────────────────────────────────────────────────────────────────────


async def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich tech_stack with Claude")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print pending count only, no API calls")
    parser.add_argument("--limit", type=int, default=200, metavar="N",
                        help="Max jobs per run (default: 200)")
    args = parser.parse_args()

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")

    model = os.getenv("ENRICHMENT_MODEL", "claude-haiku-4-5-20251001")
    prompt_hash = compute_prompt_hash()
    jobs = _load_pending(prompt_hash, args.limit)

    logger.info("enricher_start",
                pending=len(jobs), prompt_hash=prompt_hash, model=model,
                dry_run=args.dry_run)

    if not jobs:
        logger.info("enricher_done", enriched=0, errors=0, new_signals=0)
        return

    if args.dry_run:
        return

    system_prompt = render_system_prompt()
    ai_client = anthropic.AsyncAnthropic(api_key=api_key)

    results: list[dict] = []
    errors = 0

    for i, job in enumerate(jobs):
        if i > 0:
            await asyncio.sleep(_REQUEST_DELAY_S)

        log = logger.bind(source=job["source"], company=job["company"], title=job["title"])

        try:
            known, unknown = await _call_with_retry(
                ai_client, model, system_prompt, _build_user_message(job)
            )
            results.append({"id": job["id"], "known": known, "prompt_hash": prompt_hash})
            log.info("enriched", known=len(known), unknown=len(unknown))

        except Exception as exc:
            errors += 1
            log.warning("enrichment_failed", error=str(exc)[:120])
            # Mark as attempted to prevent retry loops on permanently broken descriptions.
            # enriched_tech_stack = [] means the view falls back to rule-based tech_stack.
            results.append({"id": job["id"], "known": [], "prompt_hash": prompt_hash})

    if results:
        _write_results(results)

    new_signals = sum(
        len(set(r["known"]) - set(jobs[i].get("tech_stack") or []))
        for i, r in enumerate(results)
    )
    logger.info("enricher_done",
                enriched=len(results) - errors, errors=errors, new_signals=new_signals)


if __name__ == "__main__":
    load_dotenv()
    asyncio.run(main())
