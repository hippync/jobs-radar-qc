-- Resume-to-job fit scoring — data foundation migration
-- Run after migrate.sql. Safe to re-run: uses IF NOT EXISTS.
--
-- This is an independent, on-demand system (not part of the daily pipeline
-- or weekly enrichment cron) — see docs/fit-scoring-agent.md, "Layer 3".
-- It owns these two tables exclusively and never reads or writes
-- jobs.tech_stack / jobs.enriched_tech_stack.

-- ─── candidate_profiles ────────────────────────────────────────────────────
-- One row per parsed resume. Raw resume text is never stored — only the
-- structured output of agents/resume_parser.py, so a leaked table exposes
-- a skills profile, not a person's full resume.

create table if not exists candidate_profiles (
    id           uuid primary key default uuid_generate_v4(),
    skills       text[]      not null default '{}',
    seniority    text        check (seniority in (
                     'internship','junior','mid','senior',
                     'lead','staff','principal','manager','director'
                 )),
    preferences  jsonb       not null default '{}',
    prompt_hash  text        not null,
    created_at   timestamptz not null default now()
);

-- ─── job_matches ────────────────────────────────────────────────────────────
-- One row per (job, profile) pair, written by agents/fit_scorer.py's
-- run_and_persist() wrapper. attempt tracks how many score_fit passes the
-- graph took (1 = scored on the first pass, 2 = broadened and retried once).

create table if not exists job_matches (
    id           uuid primary key default uuid_generate_v4(),
    job_id       uuid        not null references jobs(id),
    profile_id   uuid        not null references candidate_profiles(id),
    fit_score    int         not null check (fit_score between 0 and 100),
    fit_reasons  jsonb       not null default '[]',
    decision     text        check (decision in ('alert','skip')),
    attempt      int         not null default 1,
    prompt_hash  text        not null,
    created_at   timestamptz not null default now()
);

-- Re-scoring the same (job, profile) pair updates the existing row instead
-- of accumulating duplicates.
alter table job_matches
    drop constraint if exists job_matches_job_id_profile_id_key;

alter table job_matches
    add constraint job_matches_job_id_profile_id_key
    unique (job_id, profile_id);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- "Latest matches for a candidate" — the query /matches (Phase 4) runs.
create index if not exists job_matches_profile_id_created_at
    on job_matches (profile_id, created_at desc);

-- "Pending alerts to send" — Phase 3's batch/alert path.
create index if not exists job_matches_alerts_pending
    on job_matches (created_at desc)
    where decision = 'alert';

-- ─── Row-Level Security ───────────────────────────────────────────────────────
-- Deliberately no select policy (deny-by-default), unlike jobs' public-read
-- stance: these tables hold personal candidate data and are only ever
-- touched via the service-role key from the backend, never the anon key.

alter table candidate_profiles enable row level security;
alter table job_matches enable row level security;
