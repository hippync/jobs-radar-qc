"""Resume-to-job fit scoring agent — LangGraph state machine.

score_fit -> [router] -> send_alert | skip
                 ^              |         |
                 |__broaden_and_retry     |
                                          END

One Haiku call per score_fit pass (max 2 passes per job/profile pair, bounded
by max_attempts). broaden_and_retry never calls the LLM — it only relaxes the
criteria a retry pass is scored against.

This module is imported by scripts/test_fit_scoring.py (dry-run, never
writes) and by run_and_persist() below, which is the future Lambda
entrypoint's write path. storage.supabase_client is only imported inside
run_and_persist(), so importing this module never touches Supabase.

Usage:
  python -m agents.fit_scorer --job tests/fixtures/fit_scoring_jobs.json --profile ...
  (see scripts/test_fit_scoring.py for the fixture-driven harness)
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Literal, TypedDict, cast

import anthropic
import structlog
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from agents.prompt_utils import (
    compute_fit_scoring_prompt_hash,
    parse_fit_score_response,
    render_fit_scoring_prompt,
)

logger = structlog.get_logger()

_MAX_RETRIES = 3
_DEFAULT_MAX_ATTEMPTS = 2

# Thresholds — see docs/fit-scoring-agent.md for the rationale behind each number.
ALERT_THRESHOLD = 75
_RETRY_THRESHOLD = 50

Decision = Literal["alert", "skip"]


class FitState(TypedDict):
    job_id: str
    profile_id: str
    job: dict
    profile: dict
    attempt: int
    max_attempts: int
    criteria: dict
    fit_score: int | None
    fit_reasons: list[str]
    decision: Decision | None
    token_usage: dict
    prompt_hash: str
    trace: list[dict]


class FitScoreResult(BaseModel):
    score: int = Field(ge=0, le=100)
    reasons: list[str] = Field(default_factory=list)


def default_criteria() -> dict:
    return {"seniority_band": 0, "remote_strict": True, "segment_credit": False}


def build_scoring_message(job: dict, profile: dict, criteria: dict) -> str:
    seniority_note = (
        "Exact seniority match required."
        if criteria["seniority_band"] == 0
        else f"Seniority may differ by up to {criteria['seniority_band']} band(s) without penalty."
    )
    remote_note = (
        "Remote/hybrid/onsite preference must match exactly."
        if criteria["remote_strict"]
        else "Treat hybrid and remote preferences as compatible."
    )
    segment_note = (
        "Give partial credit for skills in the same technology category, not just exact matches."
        if criteria["segment_credit"]
        else "Only count exact skill matches."
    )
    return (
        f"Job:\n{json.dumps(job, default=str)}\n\n"
        f"Candidate profile:\n{json.dumps(profile, default=str)}\n\n"
        "Scoring adjustments for this pass:\n"
        f"- {seniority_note}\n"
        f"- {remote_note}\n"
        f"- {segment_note}"
    )


def _require_api_key() -> str:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    return api_key


async def _call_with_retry(
    client: anthropic.AsyncAnthropic,
    model: str,
    system_prompt: str,
    user_message: str,
) -> tuple[FitScoreResult, anthropic.types.Usage]:
    for attempt in range(_MAX_RETRIES):
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=512,
                system=[
                    {"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}
                ],
                messages=[{"role": "user", "content": user_message}],
            )
            block = response.content[0]
            if not isinstance(block, anthropic.types.TextBlock):
                raise ValueError(f"unexpected content block type: {type(block)}")
            raw = parse_fit_score_response(block.text)
            return FitScoreResult.model_validate(raw), response.usage
        except (anthropic.RateLimitError, anthropic.InternalServerError) as exc:
            if attempt < _MAX_RETRIES - 1:
                wait = 2 ** (attempt + 1)
                logger.warning("api_retry", attempt=attempt + 1, wait_s=wait, error=str(exc)[:80])
                await asyncio.sleep(wait)
            else:
                raise
    raise RuntimeError("unreachable")


# ─── Nodes ──────────────────────────────────────────────────────────────────
# Pure state transformers — no DB writes happen inside the graph. Persistence
# is the caller's job (run_and_persist, below), kept out of the graph so the
# dry-run test harness can invoke the same graph with zero side effects.


async def score_fit(state: FitState) -> dict:
    start = time.monotonic()
    model = os.getenv("FIT_SCORING_MODEL", "claude-haiku-4-5-20251001")
    system_prompt = render_fit_scoring_prompt()
    user_message = build_scoring_message(state["job"], state["profile"], state["criteria"])

    client = anthropic.AsyncAnthropic(api_key=_require_api_key())
    result, usage = await _call_with_retry(client, model, system_prompt, user_message)

    attempt = state["attempt"] + 1
    duration_ms = int((time.monotonic() - start) * 1000)
    trace_entry = {
        "node": "score_fit",
        "attempt": attempt,
        "score": result.score,
        "reasons": result.reasons,
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "duration_ms": duration_ms,
    }
    logger.info("score_fit_done", **trace_entry)

    return {
        "fit_score": result.score,
        "fit_reasons": result.reasons,
        "attempt": attempt,
        "token_usage": {
            "input": state["token_usage"]["input"] + usage.input_tokens,
            "output": state["token_usage"]["output"] + usage.output_tokens,
        },
        "trace": [*state["trace"], trace_entry],
    }


def broaden_and_retry(state: FitState) -> dict:
    criteria = dict(state["criteria"])
    changed = []

    if criteria["seniority_band"] < 1:
        criteria["seniority_band"] += 1
        changed.append("seniority_band")
    if criteria["remote_strict"]:
        criteria["remote_strict"] = False
        changed.append("remote_strict")
    if not criteria["segment_credit"]:
        criteria["segment_credit"] = True
        changed.append("segment_credit")

    trace_entry = {"node": "broaden_and_retry", "attempt": state["attempt"], "changed": changed}
    logger.info("broadened", **trace_entry)

    return {"criteria": criteria, "trace": [*state["trace"], trace_entry]}


def send_alert(state: FitState) -> dict:
    trace_entry = {"node": "send_alert", "score": state["fit_score"], "attempt": state["attempt"]}
    logger.info("would_alert", **trace_entry)
    return {"decision": "alert", "trace": [*state["trace"], trace_entry]}


def skip(state: FitState) -> dict:
    score = state["fit_score"] or 0
    reason = "below_retry_threshold" if score < _RETRY_THRESHOLD else "max_attempts_exhausted"
    trace_entry = {
        "node": "skip",
        "score": state["fit_score"],
        "attempt": state["attempt"],
        "reason": reason,
    }
    logger.info("skipped", **trace_entry)
    return {"decision": "skip", "trace": [*state["trace"], trace_entry]}


# ─── Router ─────────────────────────────────────────────────────────────────


def route_after_score(state: FitState) -> str:
    score = state["fit_score"] or 0
    if score >= ALERT_THRESHOLD:
        return "send_alert"
    if score >= _RETRY_THRESHOLD and state["attempt"] < state["max_attempts"]:
        return "broaden_and_retry"
    return "skip"


# ─── Graph assembly ─────────────────────────────────────────────────────────


@asynccontextmanager
async def _checkpointer(conn_string: str) -> AsyncIterator[AsyncSqliteSaver | AsyncPostgresSaver]:
    """Pick a checkpointer by connection-string scheme.

    Lambda's filesystem doesn't persist across invocations, so production
    (conn_string is a postgres:// URL, e.g. SUPABASE_DB_URL) needs a real
    Postgres-backed checkpointer. Local dev and scripts/test_fit_scoring.py
    keep passing a plain file path, which stays on AsyncSqliteSaver unchanged.

    Connects manually rather than via AsyncPostgresSaver.from_conn_string()
    (which hardcodes prepare_threshold=0 — "prepare on first use", not
    "never prepare"). Supabase's Supavisor pooler runs in transaction mode
    and recycles backend connections across unrelated client sessions, so a
    server-side prepared statement name from one session collides with
    another's (psycopg.errors.DuplicatePreparedStatement). prepare_threshold=
    None actually disables prepared statements, which transaction-mode
    pooling requires.
    """
    if conn_string.startswith(("postgres://", "postgresql://")):
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        from psycopg import AsyncConnection
        from psycopg.rows import dict_row

        async with await AsyncConnection.connect(
            conn_string, autocommit=True, prepare_threshold=None, row_factory=dict_row
        ) as conn:
            yield AsyncPostgresSaver(conn=conn)
    else:
        async with AsyncSqliteSaver.from_conn_string(conn_string) as saver:
            yield saver


def _build_graph(checkpointer: AsyncSqliteSaver | AsyncPostgresSaver):
    graph = StateGraph(FitState)
    graph.add_node("score_fit", score_fit)
    graph.add_node("broaden_and_retry", broaden_and_retry)
    graph.add_node("send_alert", send_alert)
    graph.add_node("skip", skip)

    graph.add_edge(START, "score_fit")
    graph.add_conditional_edges(
        "score_fit",
        route_after_score,
        {"send_alert": "send_alert", "broaden_and_retry": "broaden_and_retry", "skip": "skip"},
    )
    graph.add_edge("broaden_and_retry", "score_fit")
    graph.add_edge("send_alert", END)
    graph.add_edge("skip", END)

    return graph.compile(checkpointer=checkpointer)


async def score_job_fit(
    job: dict,
    profile: dict,
    prompt_hash: str,
    *,
    thread_id: str,
    max_attempts: int = _DEFAULT_MAX_ATTEMPTS,
    checkpoint_db: str | None = None,
) -> FitState:
    """Run the fit-scoring graph for one (job, profile) pair to completion.

    Resumable: re-invoking with the same thread_id against the same
    checkpoint_db continues from the last checkpoint rather than restarting.
    """
    resolved_checkpoint_db: str = (
        checkpoint_db
        if checkpoint_db
        else os.environ.get("FIT_SCORER_CHECKPOINT_DB", "agents/.fit_scorer_checkpoints.sqlite")
    )
    initial_state: FitState = {
        "job_id": job["id"],
        "profile_id": profile["id"],
        "job": job,
        "profile": profile,
        "attempt": 0,
        "max_attempts": max_attempts,
        "criteria": default_criteria(),
        "fit_score": None,
        "fit_reasons": [],
        "decision": None,
        "token_usage": {"input": 0, "output": 0},
        "prompt_hash": prompt_hash,
        "trace": [],
    }

    async with _checkpointer(resolved_checkpoint_db) as checkpointer:
        compiled = _build_graph(checkpointer)
        config = {"configurable": {"thread_id": thread_id}}
        final_state = await compiled.ainvoke(initial_state, config=config)

    return cast(FitState, final_state)


async def run_and_persist(job: dict, profile: dict) -> FitState:
    """Score a (job, profile) pair and upsert the result into job_matches.

    Not used by scripts/test_fit_scoring.py — kept separate, with the
    Supabase import scoped inside this function, so the dry-run harness can
    import agents.fit_scorer without ever touching the database.
    """
    from storage.supabase_client import get_client

    prompt_hash = compute_fit_scoring_prompt_hash()
    thread_id = f"{job['id']}:{profile['id']}"
    final_state = await score_job_fit(
        job,
        profile,
        prompt_hash,
        thread_id=thread_id,
        checkpoint_db=os.environ.get("SUPABASE_DB_URL"),
    )

    client = get_client()
    client.table("job_matches").upsert(
        {
            "job_id": final_state["job_id"],
            "profile_id": final_state["profile_id"],
            "fit_score": final_state["fit_score"],
            "fit_reasons": final_state["fit_reasons"],
            "decision": final_state["decision"],
            "attempt": final_state["attempt"],
            "prompt_hash": final_state["prompt_hash"],
        },
        on_conflict="job_id,profile_id",
    ).execute()

    return final_state
