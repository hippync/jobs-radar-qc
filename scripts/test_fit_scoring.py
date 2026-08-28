"""Dry-run fit-scoring script.

Runs the LangGraph fit-scoring agent (agents/fit_scorer.py) against fixture
jobs paired with fixture candidate profiles, and prints the full trace of
each run — which nodes fired, in what order, and why. No DB writes: this
module never imports storage.supabase_client (agents.fit_scorer only imports
it inside run_and_persist(), which this script never calls), and checkpoints
go to a throwaway temp SQLite file, not the shared production checkpoint DB.

Usage:
  python -m scripts.test_fit_scoring
  python -m scripts.test_fit_scoring --jobs tests/fixtures/fit_scoring_jobs.json \\
      --profiles tests/fixtures/candidate_profiles.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

import structlog
from dotenv import load_dotenv

from agents.fit_scorer import FitState, compute_fit_scoring_prompt_hash, score_job_fit

load_dotenv()
logger = structlog.get_logger()


def _load(path: str) -> list[dict]:
    return json.loads(Path(path).read_text())


def _print_trace(job_title: str, profile_name: str, state: FitState) -> None:
    print(f"[{job_title}] vs [{profile_name}]")
    for entry in state["trace"]:
        node = entry["node"]
        if node == "score_fit":
            print(
                f"  -> score_fit    attempt={entry['attempt']} score={entry['score']} "
                f"tokens={entry['input_tokens']}+{entry['output_tokens']} "
                f"duration_ms={entry['duration_ms']}"
            )
            for reason in entry["reasons"]:
                print(f"       - {reason}")
        elif node == "broaden_and_retry":
            print(f"  -> broaden_and_retry  changed={entry['changed']}")
        elif node == "send_alert":
            print(f"  -> send_alert   final_score={entry['score']} attempt={entry['attempt']}")
        elif node == "skip":
            print(
                f"  -> skip         final_score={entry['score']} attempt={entry['attempt']} "
                f"reason={entry['reason']}"
            )
    print(f"  decision: {state['decision']}  |  final score: {state['fit_score']}\n")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Dry-run fit scoring")
    parser.add_argument("--jobs", default="tests/fixtures/fit_scoring_jobs.json", metavar="PATH")
    parser.add_argument(
        "--profiles", default="tests/fixtures/candidate_profiles.json", metavar="PATH"
    )
    args = parser.parse_args()

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY is not set.", file=sys.stderr)
        sys.exit(1)

    jobs = _load(args.jobs)
    profiles = {p["name"]: p for p in _load(args.profiles)}
    prompt_hash = compute_fit_scoring_prompt_hash()

    print("\nFit-scoring dry-run")
    print(f"  Prompt hash : {prompt_hash}")
    print(f"  Jobs        : {len(jobs)}")
    print(f"  Profiles    : {len(profiles)}")
    print()

    results: list[FitState] = []
    errors = 0

    with tempfile.TemporaryDirectory() as tmp_dir:
        checkpoint_db = str(Path(tmp_dir) / "fit_scorer_test.sqlite")

        for job in jobs:
            profile = profiles.get(job["profile"])
            if profile is None:
                print(f"[{job['title']}] SKIPPED: no fixture profile named {job['profile']!r}")
                continue

            try:
                final_state = await score_job_fit(
                    job,
                    profile,
                    prompt_hash,
                    thread_id=f"{job['id']}:{profile['id']}",
                    checkpoint_db=checkpoint_db,
                )
                _print_trace(job["title"], profile["name"], final_state)
                results.append(final_state)
            except Exception as exc:
                errors += 1
                logger.warning("fit_scoring_failed", job=job["title"], error=str(exc))
                print(f"[{job['title']}] ERROR: {exc}\n")

    alerts = sum(1 for r in results if r["decision"] == "alert")
    skips = sum(1 for r in results if r["decision"] == "skip")
    retried = sum(1 for r in results if r["attempt"] > 1)
    avg_attempts = sum(r["attempt"] for r in results) / len(results) if results else 0
    total_tokens = sum(r["token_usage"]["input"] + r["token_usage"]["output"] for r in results)

    print("Summary:")
    print(f"  alert={alerts}  skip={skips}  retried={retried}  errors={errors}")
    print(f"  avg attempts={avg_attempts:.2f}  total tokens={total_tokens}")


if __name__ == "__main__":
    asyncio.run(main())
