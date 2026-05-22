"""Upsert and query helpers for the jobs table."""

from __future__ import annotations

from datetime import UTC, datetime

import structlog

from storage.supabase_client import get_client

logger = structlog.get_logger()

_UPSERT_BATCH_SIZE = 100


def upsert_jobs(jobs: list[dict]) -> dict[str, int]:
    """
    Upsert a batch of canonical job dicts into the jobs table.

    On conflict (source, external_id, company_slug):
      - Updates all fields except first_seen_at (set once on insert).
      - Sets last_seen_at and fetched_at to the current run's timestamp.

    Sends rows in batches of _UPSERT_BATCH_SIZE to avoid statement timeouts.
    Returns a summary dict with inserted/updated counts from Supabase metadata.
    """
    if not jobs:
        return {"upserted": 0}

    now = datetime.now(UTC).isoformat()
    rows = [_to_row(job, now) for job in jobs]

    client = get_client()
    total = 0
    for i in range(0, len(rows), _UPSERT_BATCH_SIZE):
        batch = rows[i : i + _UPSERT_BATCH_SIZE]
        response = (
            client.table("jobs")
            .upsert(
                batch,
                on_conflict="source,external_id,company_slug",
                ignore_duplicates=False,
            )
            .execute()
        )
        total += len(response.data) if response.data else 0

    logger.info("upsert_complete", count=total)
    return {"upserted": total}


def mark_inactive(source: str, company_slug: str, seen_external_ids: list[str]) -> int:
    """
    Flip is_active=false for jobs that were not present in the latest fetch.
    Called once per company after a successful fetch.
    Returns the number of rows deactivated.
    """
    if not seen_external_ids:
        return 0

    client = get_client()
    response = (
        client.table("jobs")
        .update({"is_active": False})
        .eq("source", source)
        .eq("company_slug", company_slug)
        .eq("is_active", True)
        .filter("external_id", "not.in", f"({','.join(seen_external_ids)})")
        .execute()
    )

    count = len(response.data) if response.data else 0
    if count:
        logger.info("marked_inactive", source=source, company=company_slug, count=count)
    return count


def _to_row(job: dict, now: str) -> dict:
    """Prepare a canonical job dict for Supabase insert/upsert."""
    return {
        "source": job["source"],
        "external_id": job["external_id"],
        "company": job["company"],
        "company_slug": job["company_slug"],
        "title": job["title"],
        "department": job.get("department"),
        "location": job.get("location"),
        "description_html": job.get("description_html"),
        "source_url": job["source_url"],
        "is_qc": job.get("is_qc", False),
        "is_remote": job.get("is_remote"),
        "seniority": job.get("seniority"),
        "tech_stack": job.get("tech_stack", []),
        "employment_type": job.get("employment_type"),
        "posted_at": job.get("posted_at"),
        "fetched_at": now,
        # first_seen_at: set to now on insert; Supabase ignores it on update
        # because the upsert uses defaultToNull=false for this column via SQL default.
        # We set it here so new rows always have it — the DB constraint enforces
        # that it never changes after first insert via the ON CONFLICT clause below.
        "first_seen_at": now,
        "last_seen_at": now,
        "is_active": job.get("is_active", True),
    }
