-- Jobs Radar QC — contextual facet counts RPC (issue #30)
-- Creates get_contextual_facets(), a DB-side aggregation function that returns
-- source, workplace, and seniority counts reflecting the currently active
-- filters rather than global totals.
--
-- Semantics (mutually-exclusive / replacement):
--   For each candidate value V in facet F, count =
--     COUNT WHERE (all active filters except F) AND F = V
--
-- This means:
--   source_counts    → applies tech + remote + seniority filters, NOT source
--   workplace_counts → applies tech + source + seniority filters, NOT remote
--   seniority_counts → applies tech + source + remote filters,    NOT seniority
--
-- Called with all NULL params → returns identical counts to get_homepage_stats(),
-- so it is safe to call unconditionally regardless of filter state.
--
-- Run after migrate.sql and migrate_enrichment.sql.
-- Safe to re-run: CREATE OR REPLACE + idempotent GRANT.
--
-- HOW TO APPLY
-- In Supabase SQL Editor: paste and run this file in one shot.
-- In psql: \i scripts/migrate_contextual_facets_rpc.sql
--
-- VALIDATION
--   SELECT get_contextual_facets(NULL, NULL, NULL, NULL);
--   -- → global counts, matches get_homepage_stats() source/workplace/seniority_counts
--
--   SELECT get_contextual_facets('TypeScript', NULL, NULL, NULL);
--   -- → counts scoped to TypeScript jobs; source/workplace/seniority breakdown
--   --   should sum to the same total as fetchJobs({tech:'TypeScript'}) returns.
--
-- NOTE ON tech_stack CONTAINMENT
-- tech_stack @> ARRAY[p_tech] on the active_qc_jobs view performs a sequential
-- scan because the view computes a merged array expression that the base-table
-- GIN index cannot satisfy (see migrate_indexes.sql for the full explanation).
-- At current dataset sizes (< 5 000 rows) this is acceptable.

CREATE OR REPLACE FUNCTION get_contextual_facets(
  p_tech      text DEFAULT NULL,
  p_source    text DEFAULT NULL,
  p_remote    text DEFAULT NULL,   -- 'true' | 'false' | 'null' | NULL (no filter)
  p_seniority text DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT json_build_object(

    -- Source counts: apply tech + remote + seniority filters, NOT source.
    -- Each entry shows how many jobs match the other active filters + that source.
    'source_counts', (
      SELECT COALESCE(json_object_agg(source, cnt), '{}'::json)
      FROM (
        SELECT source, COUNT(*) AS cnt
        FROM   active_qc_jobs
        WHERE  source IS NOT NULL
          AND  (p_tech      IS NULL OR tech_stack @> ARRAY[p_tech])
          AND  (p_seniority IS NULL OR seniority = p_seniority)
          AND  (
                 p_remote IS NULL OR
                 CASE p_remote
                   WHEN 'true'  THEN is_remote IS TRUE
                   WHEN 'false' THEN is_remote IS FALSE
                   WHEN 'null'  THEN is_remote IS NULL
                   ELSE TRUE
                 END
               )
        GROUP  BY source
      ) s
    ),

    -- Workplace counts: apply tech + source + seniority filters, NOT remote.
    -- Keys match FilterSidebar's 'true' / 'false' / 'null' convention.
    'workplace_counts', (
      SELECT COALESCE(json_object_agg(is_remote_key, cnt), '{}'::json)
      FROM (
        SELECT
          CASE
            WHEN is_remote IS TRUE  THEN 'true'
            WHEN is_remote IS FALSE THEN 'false'
            ELSE                        'null'
          END AS is_remote_key,
          COUNT(*) AS cnt
        FROM   active_qc_jobs
        WHERE  (p_tech      IS NULL OR tech_stack @> ARRAY[p_tech])
          AND  (p_source    IS NULL OR source = p_source)
          AND  (p_seniority IS NULL OR seniority = p_seniority)
        GROUP  BY 1
      ) s
    ),

    -- Seniority counts: apply tech + source + remote filters, NOT seniority.
    'seniority_counts', (
      SELECT COALESCE(json_object_agg(seniority, cnt), '{}'::json)
      FROM (
        SELECT seniority, COUNT(*) AS cnt
        FROM   active_qc_jobs
        WHERE  seniority IS NOT NULL
          AND  (p_tech   IS NULL OR tech_stack @> ARRAY[p_tech])
          AND  (p_source IS NULL OR source = p_source)
          AND  (
                 p_remote IS NULL OR
                 CASE p_remote
                   WHEN 'true'  THEN is_remote IS TRUE
                   WHEN 'false' THEN is_remote IS FALSE
                   WHEN 'null'  THEN is_remote IS NULL
                   ELSE TRUE
                 END
               )
        GROUP  BY seniority
      ) s
    )

  );
$$;

-- Allow the frontend (anon key) and authenticated users to call this function.
GRANT EXECUTE ON FUNCTION get_contextual_facets(text, text, text, text) TO anon, authenticated;
