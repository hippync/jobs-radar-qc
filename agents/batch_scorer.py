"""Weekly batch fit-scoring — Anthropic Batches API mechanics.

The on-demand path (agents/fit_scorer.py) runs a live LangGraph with a
broaden_and_retry loop. The weekly batch path can't do that: Batch API
requests are all submitted upfront and scored independently — there's no
way to inspect one result and conditionally submit a follow-up request
within the same batch. So batch scoring is a single strict pass per
(job, profile) pair, using the same default (non-broadened) criteria as
score_fit's first attempt. A score that would have qualified for a retry
on the on-demand path (50-74) just skips here, the same way it would after
agents.fit_scorer's max_attempts is exhausted.

Submit and retrieve are split into two functions, not one, because a batch
can take longer to complete than a single Lambda invocation allows (max 15
minutes) — see agents/lambda_handler.py, which calls these from two
separate EventBridge-scheduled invocations (weekly-submit, weekly-poll).

This module never imports storage.supabase_client at module level — only
inside find_pending_pairs() and persist_batch_results(), so importing it
for build_batch_requests() alone (e.g. in a test) never touches Supabase.
"""

from __future__ import annotations

import os
from typing import cast

import anthropic
import structlog
from anthropic.types.messages.batch_create_params import Request as BatchRequest

from agents.fit_scorer import (
    ALERT_THRESHOLD,
    FitScoreResult,
    build_scoring_message,
    default_criteria,
)
from agents.prompt_utils import parse_fit_score_response, render_fit_scoring_prompt

logger = structlog.get_logger()

_MAX_BATCH_PAIRS = int(os.getenv("MAX_BATCH_PAIRS", "500"))


def _custom_id(job_id: str, profile_id: str) -> str:
    return f"{job_id}:{profile_id}"


def _parse_custom_id(custom_id: str) -> tuple[str, str]:
    job_id, profile_id = custom_id.split(":", 1)
    return job_id, profile_id


def _require_api_key() -> str:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    return api_key


def build_batch_requests(pairs: list[tuple[dict, dict]]) -> list[dict]:
    """Build one Batch API request per (job, profile) pair.

    Reuses the exact same prompt-building logic as the on-demand path
    (agents.fit_scorer.build_scoring_message) with default (strict)
    criteria, so a batch score and a first-attempt on-demand score for the
    same pair are directly comparable.
    """
    system_prompt = render_fit_scoring_prompt()
    criteria = default_criteria()
    model = os.getenv("FIT_SCORING_MODEL", "claude-haiku-4-5-20251001")

    requests = []
    for job, profile in pairs:
        user_message = build_scoring_message(job, profile, criteria)
        requests.append(
            {
                "custom_id": _custom_id(job["id"], profile["id"]),
                "params": {
                    "model": model,
                    "max_tokens": 512,
                    "system": [
                        {
                            "type": "text",
                            "text": system_prompt,
                            "cache_control": {"type": "ephemeral"},
                        }
                    ],
                    "messages": [{"role": "user", "content": user_message}],
                },
            }
        )
    return requests


def find_pending_pairs(prompt_hash: str) -> list[tuple[dict, dict]]:
    """All (job, profile) pairs not yet scored at the current prompt hash.

    All candidate_profiles rows are considered "pending" for every active
    job — there's no subscription/consent flag yet (that's Phase 6), so this
    re-scores everyone who has ever used /matches against the current job
    pool. Capped at MAX_BATCH_PAIRS as a safety bound, oldest jobs dropped
    first since active_qc_jobs is already ordered newest-first.
    """
    from storage.supabase_client import get_client

    client = get_client()

    profiles = cast(list[dict], client.table("candidate_profiles").select("*").execute().data or [])
    jobs = cast(list[dict], client.table("active_qc_jobs").select("*").execute().data or [])
    already_scored = cast(
        list[dict],
        client.table("job_matches")
        .select("job_id, profile_id")
        .eq("prompt_hash", prompt_hash)
        .execute()
        .data
        or [],
    )
    scored_pairs = {(row["job_id"], row["profile_id"]) for row in already_scored}

    flat_profiles = [
        {
            "id": p["id"],
            "skills": p["skills"],
            "seniority": p["seniority"],
            **(p.get("preferences") or {}),
        }
        for p in profiles
    ]

    pairs: list[tuple[dict, dict]] = []
    for job in jobs:
        for profile in flat_profiles:
            if (job["id"], profile["id"]) in scored_pairs:
                continue
            pairs.append((job, profile))
            if len(pairs) >= _MAX_BATCH_PAIRS:
                return pairs
    return pairs


def submit_batch(pairs: list[tuple[dict, dict]]) -> str:
    """Submit a batch of scoring requests. Returns the Anthropic batch id."""
    client = anthropic.Anthropic(api_key=_require_api_key())
    requests = build_batch_requests(pairs)
    batch = client.messages.batches.create(requests=cast(list[BatchRequest], requests))
    logger.info("batch_submitted", batch_id=batch.id, pairs=len(pairs))
    return batch.id


def get_batch_status(batch_id: str) -> str:
    """Return the batch's processing_status: 'in_progress', 'ended', etc."""
    client = anthropic.Anthropic(api_key=_require_api_key())
    batch = client.messages.batches.retrieve(batch_id)
    return batch.processing_status


def retrieve_batch_results(batch_id: str) -> list[dict]:
    """Retrieve a completed batch's results as job_matches-ready rows.

    A result with type != 'succeeded' (errored/canceled/expired) is logged
    and skipped, not written — a bad row shouldn't block the rest of the
    batch from being persisted.
    """
    client = anthropic.Anthropic(api_key=_require_api_key())
    rows: list[dict] = []

    for item in client.messages.batches.results(batch_id):
        job_id, profile_id = _parse_custom_id(item.custom_id)

        if item.result.type != "succeeded":
            logger.warning("batch_result_failed", custom_id=item.custom_id, type=item.result.type)
            continue

        block = item.result.message.content[0]
        if not isinstance(block, anthropic.types.TextBlock):
            logger.warning("batch_result_unexpected_block", custom_id=item.custom_id)
            continue

        try:
            raw = parse_fit_score_response(block.text)
            score_result = FitScoreResult.model_validate(raw)
        except Exception as exc:
            logger.warning("batch_result_parse_failed", custom_id=item.custom_id, error=str(exc))
            continue

        decision = "alert" if score_result.score >= ALERT_THRESHOLD else "skip"
        rows.append(
            {
                "job_id": job_id,
                "profile_id": profile_id,
                "fit_score": score_result.score,
                "fit_reasons": score_result.reasons,
                "decision": decision,
                "attempt": 1,
            }
        )

    return rows


def persist_batch_results(rows: list[dict], prompt_hash: str) -> None:
    """Upsert scored rows into job_matches. No-op on an empty list."""
    if not rows:
        return

    from storage.supabase_client import get_client

    client = get_client()
    client.table("job_matches").upsert(
        [{**row, "prompt_hash": prompt_hash} for row in rows],
        on_conflict="job_id,profile_id",
    ).execute()
    logger.info("batch_results_persisted", rows=len(rows))
