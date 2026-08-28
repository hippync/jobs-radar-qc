"""AWS Lambda entrypoint for the fit-scoring agent.

Two triggers call handler():
  - Lambda Function URL (on-demand): {"resume_text": "..."} -> scored matches
  - EventBridge Scheduler (weekly): {"trigger": "weekly-submit"} or
    {"trigger": "weekly-poll"} -> batch scoring, see agents/batch_scorer.py

Secrets (ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL) are
read from SSM Parameter Store once at cold start and cached in os.environ —
every downstream module (agents.resume_parser, agents.fit_scorer,
agents.batch_scorer, storage.supabase_client) reads them via the exact same
os.getenv calls it already uses locally; this module is the only place that
knows SSM exists. Already-set env vars are left alone, which is what makes
local Lambda Runtime Interface Emulator testing work without AWS
credentials — see infra/RUNBOOK.md.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
from typing import Any, cast

import boto3
import structlog

from agents.batch_scorer import (
    find_pending_pairs,
    get_batch_status,
    persist_batch_results,
    retrieve_batch_results,
    submit_batch,
)
from agents.fit_scorer import compute_fit_scoring_prompt_hash, run_and_persist
from agents.resume_parser import parse_resume, persist_candidate_profile

logger = structlog.get_logger()

_SSM_PREFIX = os.environ.get("SSM_PARAMETER_PREFIX", "/jobs-radar-qc/fit-scorer")
_SSM_SECRET_PARAMS = {
    "ANTHROPIC_API_KEY": "anthropic-api-key",
    "SUPABASE_SERVICE_ROLE_KEY": "supabase-service-role-key",
    "SUPABASE_DB_URL": "supabase-db-url",
}
_BATCH_ID_PARAM = f"{_SSM_PREFIX}/pending-batch-id"
_MATCH_JOB_LIMIT = int(os.environ.get("MATCH_JOB_LIMIT", "30"))
_SCORING_CONCURRENCY = int(os.environ.get("SCORING_CONCURRENCY", "5"))


def _load_secrets_from_ssm() -> None:
    """Populate os.environ from SSM once at cold start (module import time).

    No-op (and never constructs an SSM client) when every secret is already
    set via env vars — this is what lets local Lambda Runtime Interface
    Emulator testing work without a resolvable AWS region or credentials.
    """
    missing = {k: v for k, v in _SSM_SECRET_PARAMS.items() if not os.environ.get(k)}
    if not missing:
        return

    ssm = boto3.client("ssm")
    for env_var, param_name in missing.items():
        response = ssm.get_parameter(Name=f"{_SSM_PREFIX}/{param_name}", WithDecryption=True)
        os.environ[env_var] = response["Parameter"]["Value"]


_load_secrets_from_ssm()


def _is_function_url_event(event: dict) -> bool:
    return "requestContext" in event and "http" in event.get("requestContext", {})


def _response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": os.environ.get("CORS_ALLOW_ORIGIN", "*"),
        },
        "body": json.dumps(body),
    }


async def _score_one(semaphore: asyncio.Semaphore, job: dict, profile: dict) -> dict:
    async with semaphore:
        final_state = await run_and_persist(job, profile)
    return {
        "job_id": job["id"],
        "title": job.get("title"),
        "company": job.get("company"),
        "fit_score": final_state["fit_score"],
        "fit_reasons": final_state["fit_reasons"],
        "decision": final_state["decision"],
        "attempt": final_state["attempt"],
    }


async def _handle_on_demand(event: dict) -> dict:
    raw_body = event.get("body", "")
    if event.get("isBase64Encoded"):
        raw_body = base64.b64decode(raw_body).decode()

    try:
        payload = json.loads(raw_body or "{}")
        resume_text = payload["resume_text"]
    except (json.JSONDecodeError, KeyError):
        return _response(400, {"error": "expected JSON body with a 'resume_text' field"})

    try:
        profile, prompt_hash = await parse_resume(resume_text)
        profile_id = persist_candidate_profile(profile, prompt_hash)
        profile_dict = {"id": profile_id, **profile.model_dump()}

        from storage.supabase_client import get_client

        jobs_response = (
            get_client()
            .table("active_qc_jobs")
            .select("*")
            .order("first_seen_at", desc=True)
            .limit(_MATCH_JOB_LIMIT)
            .execute()
        )
        jobs = cast(list[dict], jobs_response.data or [])

        semaphore = asyncio.Semaphore(_SCORING_CONCURRENCY)
        matches = await asyncio.gather(*(_score_one(semaphore, job, profile_dict) for job in jobs))
    except Exception as exc:
        logger.error("on_demand_failed", error=str(exc))
        return _response(500, {"error": "scoring failed, see logs for details"})

    ranked = sorted(matches, key=lambda m: m["fit_score"] or 0, reverse=True)
    return _response(200, {"profile_id": profile_id, "matches": ranked})


def _handle_weekly_submit() -> dict:
    prompt_hash = compute_fit_scoring_prompt_hash()
    pairs = find_pending_pairs(prompt_hash)
    if not pairs:
        logger.info("weekly_submit_skipped", reason="no_pending_pairs")
        return {"submitted": False, "pairs": 0}

    batch_id = submit_batch(pairs)
    boto3.client("ssm").put_parameter(
        Name=_BATCH_ID_PARAM,
        Value=json.dumps({"batch_id": batch_id, "prompt_hash": prompt_hash}),
        Type="String",
        Overwrite=True,
    )
    return {"submitted": True, "pairs": len(pairs), "batch_id": batch_id}


def _handle_weekly_poll() -> dict:
    ssm = boto3.client("ssm")
    try:
        raw_state = ssm.get_parameter(Name=_BATCH_ID_PARAM)["Parameter"]["Value"]
    except ssm.exceptions.ParameterNotFound:
        logger.info("weekly_poll_skipped", reason="no_pending_batch")
        return {"polled": False, "reason": "no_pending_batch"}

    state = json.loads(raw_state)
    batch_id, prompt_hash = state["batch_id"], state["prompt_hash"]

    status = get_batch_status(batch_id)
    if status != "ended":
        logger.info("weekly_poll_still_in_progress", batch_id=batch_id, status=status)
        return {"polled": True, "status": status}

    results = retrieve_batch_results(batch_id)
    persist_batch_results(results, prompt_hash)
    ssm.delete_parameter(Name=_BATCH_ID_PARAM)
    return {"polled": True, "status": "ended", "results": len(results)}


def handler(event: dict, context: Any) -> dict:
    if _is_function_url_event(event):
        return asyncio.run(_handle_on_demand(event))

    trigger = event.get("trigger")
    if trigger == "weekly-submit":
        return _handle_weekly_submit()
    if trigger == "weekly-poll":
        return _handle_weekly_poll()

    raise ValueError(f"unrecognized event shape: {event!r}")
