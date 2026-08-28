# Resume-to-Job Fit Scoring Agent

An on-demand agent that scores how well a parsed candidate profile fits a job, using a LangGraph state machine with a bounded retry loop. Built in two local phases — resume parsing (Phase 1) and the scoring graph (Phase 2) — before any AWS deployment.

---

## Layer 3 — on-demand

[CLAUDE.md](../CLAUDE.md) defines two layers for the existing job-ingestion system: Layer 1 (daily, deterministic, never calls an LLM) and Layer 2 (weekly, LLM-based enrichment). This agent is neither — it's a third, independent concern:

- **Triggered on-demand**, not by a cron schedule (later, via a Lambda Function URL hit from `/matches`).
- **Owns `candidate_profiles` and `job_matches` exclusively.** It never reads or writes `jobs.tech_stack` or `jobs.enriched_tech_stack` — it only reads `jobs`/`active_qc_jobs` (read-only) to score against.
- **A failure here doesn't affect Layers 1 or 2**, and vice versa — same failure-isolation principle, applied to a third independent system rather than a variation on the first two.

## Why LangGraph, here specifically

Nothing else in this repo uses graph-based orchestration — [`agents/enricher.py`](../agents/enricher.py) (Layer 2) is a hand-rolled async loop with manual retry/backoff, and that pattern is reused wherever it fits (prompt-hash versioning, the dry-run harness shape, structlog conventions). It doesn't fit here: fit scoring needs a real conditional retry loop back into an earlier node with mutated state, not just a linear call-and-retry-on-error. That's what LangGraph is for. Using it reflexively for the tech extractor or resume parser — both single LLM calls — would have been the wrong call; using it here is not.

---

## `FitState`

| Field | Type | Meaning |
|---|---|---|
| `job_id`, `profile_id` | `str` | Identify the pair being scored |
| `job`, `profile` | `dict` | Raw job row / candidate profile passed into the graph |
| `attempt` | `int` | How many `score_fit` passes have run (1 after the first, 2 after a retry) |
| `max_attempts` | `int` | Hard cap on `score_fit` passes (default 2) |
| `criteria` | `dict` | Mutable scoring adjustments: `seniority_band`, `remote_strict`, `segment_credit` — mutated only by `broaden_and_retry` |
| `fit_score` | `int \| None` | Latest score, 0–100 |
| `fit_reasons` | `list[str]` | Latest score's short reasons, as returned by the LLM |
| `decision` | `"alert" \| "skip" \| None` | Set by the terminal node |
| `token_usage` | `dict` | Running `{input, output}` token totals across all passes |
| `prompt_hash` | `str` | Hash of the fit-scoring prompt used for this run |
| `trace` | `list[dict]` | Append-only log, one entry per node transition — what `scripts/test_fit_scoring.py` prints |

## Nodes

```
        START
          |
          v
     ┌─score_fit─┐<─────────────┐
     └─────┬─────┘              │
           │ [router]           │
   ┌───────┼───────┐            │
   v       v        v            │
alert   broaden   skip           │
   |    _and_retry  |            │
   |       └────────┼────────────┘
   v                v
  END              END
```

- **`score_fit`** — one Haiku call with the job, profile, and current `criteria`. Sets `fit_score`/`fit_reasons`, increments `attempt`, appends a trace entry (score, reasons, tokens, duration). The only node that calls the LLM.
- **`broaden_and_retry`** — no LLM call. Widens `criteria.seniority_band` by one, relaxes `criteria.remote_strict`, and enables `criteria.segment_credit` (same-category partial skill credit) — then routes back to `score_fit`, which re-scores under the relaxed rules.
- **`send_alert`** — terminal. Sets `decision = "alert"`.
- **`skip`** — terminal. Sets `decision = "skip"`, with a reason (`below_retry_threshold` or `max_attempts_exhausted`).

## Router (after `score_fit`)

```
score >= 75                              -> send_alert
50 <= score < 75  and attempt < max_attempts -> broaden_and_retry (-> score_fit again)
otherwise                                -> skip
```

## Thresholds

- **Alert ≥ 75** — only strong, multi-factor overlap (skills + seniority + preference) interrupts the candidate. Keeps alert fatigue low; a resume-matching tool that pages the user on mediocre matches gets ignored.
- **Retry 50–74** — borderline scores are usually one fixable blocker: a strict remote-preference mismatch, a one-band seniority gap, or an exact-skill-match rule that misses an equivalent skill in the same category. Worth one broadened re-score before giving up.
- **Skip < 50** — fundamentally misaligned domain or stack (e.g. a mobile job scored against a backend profile). Broadening the criteria can't manufacture skill overlap that doesn't exist, so don't spend a second API call on it.
- **`max_attempts = 2`** — bounds cost to at most 2 Haiku calls per (job, profile) pair and guarantees the retry loop terminates.

These are starting values tuned against the 20-job fixture set in `tests/fixtures/fit_scoring_jobs.json` (6 clear-fit, 6 clear-miss, 8 borderline cases split across three profile archetypes). Re-run `scripts/test_fit_scoring.py` after any prompt or threshold change and confirm the clear-fit/clear-miss cases stay stable while the borderline cases still show retries firing.

**Known gap:** the fixture set reliably exercises `below_retry_threshold` (first pass < 50) and the retry-then-alert path (jobs 13/14 in the fixtures both crossed 75 after `broaden_and_retry`), but not `max_attempts_exhausted` (retried once, still 50–74). Two fixtures were deliberately built to land there — a seniority gap wide enough that a one-band widen shouldn't cover it, paired with otherwise-strong skill/remote overlap — and both scored well under 50 on the first pass instead, skipping before a retry ever fired. Comparing job 14 (1-band seniority gap, ~60 first-pass) to job 17 (identical skills/remote, 2-band gap, ~32 first-pass) shows the model's seniority penalty isn't linear in band count, which makes hand-tuning a fixture into a specific score band unreliable. The `max_attempts_exhausted` code path itself is correct (see `skip()` in `agents/fit_scorer.py`), it's just unexercised by this fixture set — worth another pass if a specific test of that path matters.

## Checkpointing

`agents/fit_scorer.py` uses `AsyncSqliteSaver` (the async variant is required — the graph's nodes are async, since `score_fit` calls `anthropic.AsyncAnthropic`). Each `(job, profile)` pair gets its own `thread_id`, so re-invoking `score_job_fit()` with the same job/profile/checkpoint-db resumes from the last checkpoint rather than restarting and re-spending a Haiku call. The dry-run harness (`scripts/test_fit_scoring.py`) points the checkpointer at a throwaway temp file per run, so fixture runs never accumulate state across invocations. The production path (`run_and_persist()`) defaults to `agents/.fit_scorer_checkpoints.sqlite`, overridable via `FIT_SCORER_CHECKPOINT_DB`; Phase 3 swaps this for a Postgres checkpointer against Supabase.

## Logging

Every node transition emits a structlog event: `score_fit_done` (attempt, score, reasons, input/output tokens, duration_ms), `broadened` (which criteria fields changed), `would_alert`, `skipped` (with reason). Same event-name-first convention as `agents/enricher.py`.

## No DB writes in the graph itself

All four nodes are pure state transformers. `agents/fit_scorer.py` never imports `storage.supabase_client` at module level — the import is scoped inside `run_and_persist()`, the thin wrapper that upserts a `job_matches` row after the graph completes. `scripts/test_fit_scoring.py` calls `score_job_fit()` directly and never calls `run_and_persist()`, so the dry-run harness is structurally incapable of writing to Supabase, not just flag-gated against it.
