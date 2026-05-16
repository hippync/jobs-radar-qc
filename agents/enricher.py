"""Tech stack enrichment agent — Greenhouse, Lever, and Workable.

For Greenhouse and Lever: descriptions are already stored in description_html.
For Workable: the list endpoint has no description, so the enricher fetches
each job's detail page (source_url /j/{ID} → /jobs/view/{ID}.md) on demand.

Sequential with 1.2 s delay between requests to stay under Tier 1 limits
(50 RPM). Retries up to 3× on 429 / 5xx with exponential backoff. A
per-job failure never aborts the run — failed jobs are marked as attempted
so the same broken description doesn't burn retries on every daily run.

Usage:
  python -m agents.enricher              # enrich all pending jobs
  python -m agents.enricher --dry-run    # print counts, no API calls
  python -m agents.enricher --limit 200  # cap at N jobs per run
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
from datetime import datetime, timezone

import anthropic
import httpx
import structlog
from dotenv import load_dotenv

from agents.prompt_utils import compute_prompt_hash, parse_llm_response, render_system_prompt, strip_html
from storage.supabase_client import get_client

logger = structlog.get_logger()

_SOURCES = ["greenhouse", "lever", "workable"]
_MAX_DESC_CHARS = 2000
_REQUEST_DELAY_S = 1.2
_MAX_RETRIES = 3


# ─── DB helpers ──────────────────────────────────────────────────────────────


def _load_pending(prompt_hash: str, limit: int) -> list[dict]:
    """Return active jobs not yet enriched with this prompt version."""
    client = get_client()
    response = (
        client.table("jobs")
        .select("id, title, description_html, tech_stack, source, company, source_url")
        .eq("is_active", True)
        .in_("source", _SOURCES)
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


# ─── Workable detail fetch ────────────────────────────────────────────────────


def _workable_detail_url(source_url: str) -> str | None:
    """Convert /j/{ID} to /jobs/view/{ID}.md for Workable detail fetch."""
    m = re.search(r"/j/([A-F0-9]+)$", source_url, re.IGNORECASE)
    if not m:
        return None
    base = source_url[: m.start()]
    return f"{base}/jobs/view/{m.group(1)}.md"


async def _fetch_workable_description(http: httpx.AsyncClient, source_url: str) -> str:
    """Fetch a Workable detail page and return the plain-text content."""
    detail_url = _workable_detail_url(source_url)
    if not detail_url:
        return ""
    try:
        response = await http.get(detail_url, timeout=15.0)
        response.raise_for_status()
        # The .md endpoint returns markdown — strip basic markdown syntax
        # (headers, bullets, bold) so the LLM gets clean prose.
        text = re.sub(r"^#{1,6}\s+", "", response.text, flags=re.MULTILINE)
        text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
        text = re.sub(r"\*([^*]+)\*", r"\1", text)
        text = re.sub(r"^[-*]\s+", "", text, flags=re.MULTILINE)
        text = re.sub(r"\s+", " ", text).strip()
        return text
    except httpx.HTTPError as exc:
        logger.warning("workable_fetch_failed", url=detail_url, error=str(exc)[:80])
        return ""


# ─── Claude helpers ──────────────────────────────────────────────────────────


def _build_user_message(title: str, description: str) -> str:
    text = description.strip() if description else "(no description available)"
    if len(text) > _MAX_DESC_CHARS:
        text = text[:_MAX_DESC_CHARS] + "…"
    return f"Title: {title}\n\nDescription:\n{text}"


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

    async with httpx.AsyncClient(headers={"User-Agent": "jobs-radar-qc/0.1"}) as http:
        for i, job in enumerate(jobs):
            if i > 0:
                await asyncio.sleep(_REQUEST_DELAY_S)

            log = logger.bind(source=job["source"], company=job["company"], title=job["title"])

            try:
                if job["source"] == "workable":
                    raw_desc = await _fetch_workable_description(http, job["source_url"])
                else:
                    raw = job.get("description_html") or ""
                    raw_desc = strip_html(raw) if raw else ""

                user_message = _build_user_message(job["title"], raw_desc)
                known, unknown = await _call_with_retry(
                    ai_client, model, system_prompt, user_message
                )
                results.append({"id": job["id"], "known": known, "prompt_hash": prompt_hash})
                log.info("enriched", known=len(known), unknown=len(unknown))

            except Exception as exc:
                errors += 1
                log.warning("enrichment_failed", error=str(exc)[:120])
                # Mark as attempted to prevent retry loops on permanently broken jobs.
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
