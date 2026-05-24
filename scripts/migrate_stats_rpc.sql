-- Jobs Radar QC — homepage stats RPC
-- Creates get_homepage_stats(), a single DB-side call that replaces the previous
-- client-side aggregation in fetchStats() (frontend/app/page.tsx, issue #48).
-- Run after migrate.sql and migrate_enrichment.sql.
-- Safe to re-run: CREATE OR REPLACE + idempotent GRANT.
--
-- ⚠  DATE SEMANTICS
-- new_today uses CURRENT_DATE which is UTC midnight in Supabase.
-- The previous fetchStats() used JS `new Date(); setHours(0, 0, 0, 0)` on the
-- Next.js server (Vercel, UTC). Both resolve to UTC midnight — semantics match.
-- If you ever deploy the Next.js server in a non-UTC timezone, prefer AT TIME ZONE.
--
-- ⚠  REMOTE / HYBRID DEFINITION
-- is_remote = true  → remote (counts toward remote_percent)
-- is_remote = null  → hybrid / unknown (counts toward remote_percent)
-- is_remote = false → on-site (excluded from remote_percent)
-- This matches the previous JS: `if (row.is_remote !== false) remoteOrHybrid++`
--
-- ⚠  HOW TO APPLY
-- In Supabase SQL Editor: paste and run this file in one shot.
-- In psql: \i scripts/migrate_stats_rpc.sql
--
-- VALIDATION (run in Supabase SQL Editor after applying)
--   SELECT get_homepage_stats();
-- Expected: a JSON object with new_today, company_count, remote_percent,
--           source_counts, seniority_counts, workplace_counts,
--           source_options, tech_options — all computed from active_qc_jobs.
--
-- NOTE ON TECH OPTIONS PERFORMANCE
-- UNNEST over all active jobs is done entirely in the DB (no row transfer).
-- At 10 000 jobs × avg 5 techs ≈ 50 000 values → DISTINCT collapses to
-- ~100–200 unique tech strings. This is negligible compared to the previous
-- approach (fetching all row data over the network).

CREATE OR REPLACE FUNCTION get_homepage_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT json_build_object(

    -- ── KPI strip ────────────────────────────────────────────────────────────

    -- Jobs whose first_seen_at is on or after today's UTC midnight
    'new_today', (
      SELECT COUNT(*)
      FROM   active_qc_jobs
      WHERE  first_seen_at >= CURRENT_DATE
    ),

    -- Deduplicated company names
    'company_count', (
      SELECT COUNT(DISTINCT company)
      FROM   active_qc_jobs
    ),

    -- Percentage of roles that are remote or hybrid (is_remote IS NOT FALSE)
    'remote_percent', (
      SELECT CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(
          100.0 * COUNT(*) FILTER (WHERE is_remote IS NOT FALSE)
               / COUNT(*),
          1
        )
      END
      FROM active_qc_jobs
    ),

    -- ── Filter sidebar counts ────────────────────────────────────────────────

    'source_counts', (
      SELECT COALESCE(json_object_agg(source, cnt), '{}'::json)
      FROM (
        SELECT source, COUNT(*) AS cnt
        FROM   active_qc_jobs
        WHERE  source IS NOT NULL
        GROUP  BY source
      ) s
    ),

    'seniority_counts', (
      SELECT COALESCE(json_object_agg(seniority, cnt), '{}'::json)
      FROM (
        SELECT seniority, COUNT(*) AS cnt
        FROM   active_qc_jobs
        WHERE  seniority IS NOT NULL
        GROUP  BY seniority
      ) s
    ),

    -- Keys are stringified to match FilterSidebar's 'true'/'false'/'null' convention
    'workplace_counts', (
      SELECT COALESCE(json_object_agg(is_remote_key, cnt), '{}'::json)
      FROM (
        SELECT
          CASE
            WHEN is_remote = true  THEN 'true'
            WHEN is_remote = false THEN 'false'
            ELSE                        'null'
          END AS is_remote_key,
          COUNT(*) AS cnt
        FROM active_qc_jobs
        GROUP BY 1
      ) s
    ),

    -- ── Filter sidebar options ───────────────────────────────────────────────

    'source_options', (
      SELECT COALESCE(json_agg(src ORDER BY src), '[]'::json)
      FROM (
        SELECT DISTINCT source AS src
        FROM   active_qc_jobs
        WHERE  source IS NOT NULL
      ) s
    ),

    -- All distinct technology names from the merged tech_stack column
    'tech_options', (
      SELECT COALESCE(json_agg(tech ORDER BY tech), '[]'::json)
      FROM (
        SELECT DISTINCT UNNEST(COALESCE(tech_stack, '{}')) AS tech
        FROM   active_qc_jobs
      ) t
      WHERE tech IS NOT NULL
        AND tech <> ''
    )

  );
$$;

-- Allow the frontend (anon key) and authenticated users to call this function.
GRANT EXECUTE ON FUNCTION get_homepage_stats() TO anon, authenticated;
