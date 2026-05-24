-- Jobs Radar QC — homepage query indexes
-- Run after migrate.sql and migrate_enrichment.sql.
-- Safe to re-run: every statement uses IF NOT EXISTS.
--
-- ⚠  CONCURRENTLY RESTRICTION
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- In Supabase SQL Editor, paste and run each statement individually
-- (the editor issues each statement outside a transaction by default).
-- If you use psql, run outside BEGIN/COMMIT or use \i with --single-transaction=off.
--
-- HOW TO VALIDATE
-- Run the queries below in the Supabase SQL Editor after applying this migration
-- to confirm index usage:
--
--   EXPLAIN ANALYZE
--     SELECT * FROM active_qc_jobs
--     ORDER BY first_seen_at DESC
--     LIMIT 30;
--
--   EXPLAIN ANALYZE
--     SELECT * FROM active_qc_jobs
--     WHERE source = 'greenhouse'
--     ORDER BY first_seen_at DESC
--     LIMIT 30;
--
--   EXPLAIN ANALYZE
--     SELECT * FROM active_qc_jobs
--     WHERE seniority = 'senior'
--     ORDER BY first_seen_at DESC
--     LIMIT 30;
--
--   EXPLAIN ANALYZE
--     SELECT * FROM active_qc_jobs
--     WHERE is_remote = true
--     ORDER BY first_seen_at DESC
--     LIMIT 30;
--
-- Expected: "Index Scan" or "Bitmap Index Scan" on the relevant index,
-- NOT "Seq Scan" on jobs. Compare planning and execution time before/after.
--
-- NOTE ON tech_stack CONTAINMENT
-- The active_qc_jobs view computes tech_stack as:
--   ARRAY(SELECT DISTINCT UNNEST(tech_stack || enriched_tech_stack) ORDER BY 1)
-- Because this is a derived expression, a WHERE tech_stack @> ARRAY[...] filter
-- against the view cannot use the base-table GIN index (jobs_tech_stack_gin).
-- PostgreSQL evaluates the subquery per row and applies the filter post-compute.
-- To fix this properly, the view would need to become a materialized view.
-- That is out of scope for this migration — logged as a known limitation.

-- ─── Composite covering index (unfiltered homepage + view scan) ───────────────
-- Supports the view's own ORDER BY and all unfiltered homepage listings.
-- Includes is_qc so the planner can satisfy the view's WHERE + ORDER in one
-- index scan without a separate sort step.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_active_qc_first_seen_at
    ON jobs (is_qc, is_active, first_seen_at DESC);

-- ─── Sort-only partial index (active QC jobs sorted by date) ─────────────────
-- Tighter partial index for the most frequent query: all active QC jobs by date.
-- Smaller than idx_jobs_active_qc_first_seen_at and used when the planner
-- already knows is_qc = true AND is_active = true from context (e.g. a view).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_first_seen_at_active_qc
    ON jobs (first_seen_at DESC)
    WHERE is_qc = true AND is_active = true;

-- ─── Source filter ────────────────────────────────────────────────────────────
-- Supports: query.eq("source", "greenhouse" | "lever" | "workable")
-- The existing jobs_source_company_slug index is (source, company_slug) without
-- any is_qc/is_active predicate — it does not serve the homepage filter.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_source_active_qc
    ON jobs (source)
    WHERE is_qc = true AND is_active = true;

-- ─── Seniority filter ─────────────────────────────────────────────────────────
-- Supports: query.eq("seniority", "junior" | "mid" | "senior" | ...)
-- No prior index existed for this column.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_seniority_active_qc
    ON jobs (seniority)
    WHERE is_qc = true AND is_active = true;

-- ─── Remote / workplace filter ────────────────────────────────────────────────
-- Supports: query.eq("is_remote", true | false) and query.is("is_remote", null)
-- Partial indexes include NULL values, so IS NULL lookups benefit as well.
-- No prior index existed for this column.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_is_remote_active_qc
    ON jobs (is_remote)
    WHERE is_qc = true AND is_active = true;

-- ─── Tech stack GIN (already exists from migrate.sql) ────────────────────────
-- jobs_tech_stack_gin: ON jobs USING GIN (tech_stack)
-- This index covers base-table .contains() queries on the jobs.tech_stack column.
-- It is NOT used for tech_stack @> filters on active_qc_jobs because the view
-- computes a merged array — see the NOTE ON tech_stack CONTAINMENT above.
-- No new GIN index is created here; the existing one is kept as-is.
