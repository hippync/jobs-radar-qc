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


async def main() -> None:
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("ERROR: SUPABASE_DB_URL is not set.", file=sys.stderr)
        sys.exit(1)

    async with AsyncPostgresSaver.from_conn_string(db_url) as checkpointer:
        await checkpointer.setup()

    print("Checkpoint tables created (or already present).")


if __name__ == "__main__":
    load_dotenv()
    asyncio.run(main())
