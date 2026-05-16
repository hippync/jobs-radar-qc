-- Enrichment agent columns — Step 0 migration
-- Run after migrate.sql. Safe to re-run: uses IF NOT EXISTS.

-- ─── New columns ─────────────────────────────────────────────────────────────

alter table jobs
    add column if not exists enriched_at           timestamptz,
    add column if not exists enriched_prompt_hash  text,
    add column if not exists enriched_tech_stack   text[] not null default '{}';

-- Partial index: fast lookup for the enricher's "what hasn't been enriched yet"
-- query, and for re-enrichment queries filtered by prompt hash.
create index if not exists jobs_not_enriched
    on jobs (fetched_at desc)
    where enriched_at is null;

create index if not exists jobs_enriched_prompt_hash
    on jobs (enriched_prompt_hash)
    where enriched_at is not null;

-- ─── Update active_qc_jobs view ───────────────────────────────────────────────
-- tech_stack column now exposes the union of rule-based + LLM results,
-- deduplicated. Frontend query .contains("tech_stack", [...]) is unchanged.

create or replace view active_qc_jobs as
    select
        id, source, company, title, department, location,
        source_url, is_remote, seniority,
        array(
            select distinct unnest(tech_stack || enriched_tech_stack)
            order by 1
        ) as tech_stack,
        employment_type, posted_at, first_seen_at
    from jobs
    where is_qc = true
      and is_active = true
    order by first_seen_at desc;
