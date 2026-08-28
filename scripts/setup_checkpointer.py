"""One-off: create the LangGraph checkpoint tables in the production Postgres DB.

Run once before the first production deploy (or after a langgraph-checkpoint
upgrade that changes its schema) — not run on every Lambda cold start, since
AsyncPostgresSaver.setup() does DDL checks that are wasted work on a table
that already exists.

Usage:
  SUPABASE_DB_URL=postgresql://... python -m scripts.setup_checkpointer
"""

from __future__ import annotations

import asyncio
import os
import sys

from dotenv import load_dotenv
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg import AsyncConnection
from psycopg.rows import dict_row


async def main() -> None:
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("ERROR: SUPABASE_DB_URL is not set.", file=sys.stderr)
        sys.exit(1)

    # prepare_threshold=None, not the library default of 0 — Supabase's
    # Supavisor pooler (transaction mode) recycles backend connections across
    # unrelated sessions, so a server-side prepared statement from one
    # session collides with another's. See agents/fit_scorer.py::_checkpointer.
    async with await AsyncConnection.connect(
        db_url, autocommit=True, prepare_threshold=None, row_factory=dict_row
    ) as conn:
        await AsyncPostgresSaver(conn=conn).setup()

    print("Checkpoint tables created (or already present).")


if __name__ == "__main__":
    load_dotenv()
    asyncio.run(main())
