"""Orchestrator — discovers all specs, runs extractors in parallel, writes to DB."""

from __future__ import annotations

import asyncio

import structlog

from pipeline.extractor import SPECS_DIR, Extractor
from storage.jobs_repository import mark_inactive, upsert_jobs

logger = structlog.get_logger()


async def _run_source(source: str) -> list[dict]:
    try:
        return await Extractor(source).run()
    except Exception as exc:
        logger.error("source_failed", source=source, error=str(exc))
        return []


async def main() -> None:
    sources = [
        d.name for d in sorted(SPECS_DIR.iterdir()) if d.is_dir() and (d / "schema.json").exists()
    ]

    if not sources:
        logger.warning("no_sources_found", specs_dir=str(SPECS_DIR))
        return

    logger.info("run_start", sources=sources)

    batches = await asyncio.gather(*[_run_source(s) for s in sources])
    all_jobs = [job for batch in batches for job in batch]

    if not all_jobs:
        logger.warning("no_jobs_fetched")
        return

    # Only persist QC-located jobs — non-QC jobs are fetched for is_active bookkeeping
    # but must never pollute the DB or cause oversized upserts.
    qc_jobs = [job for job in all_jobs if job.get("is_qc")]
    logger.info("qc_filter", total_fetched=len(all_jobs), qc_count=len(qc_jobs))

    upsert_result = upsert_jobs(qc_jobs)

    # mark_inactive only for companies that returned ≥1 job — if a fetch failed
    # entirely we skip it rather than risk falsely deactivating all their jobs.
    seen: dict[tuple[str, str], list[str]] = {}
    for job in qc_jobs:
        seen.setdefault((job["source"], job["company_slug"]), []).append(job["external_id"])

    total_deactivated = sum(
        mark_inactive(source, slug, ids) for (source, slug), ids in seen.items()
    )

    logger.info(
        "run_complete",
        fetched=len(all_jobs),
        upserted=upsert_result["upserted"],
        deactivated=total_deactivated,
    )


if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv()
    asyncio.run(main())
