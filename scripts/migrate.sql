-- Jobs Radar QC — initial schema migration
-- Run once against your Supabase project via the SQL editor or psql.
-- Safe to re-run: uses IF NOT EXISTS everywhere.

-- ─── Extensions ──────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";

-- ─── Main table ──────────────────────────────────────────────────────────────

create table if not exists jobs (
    id                  uuid primary key default uuid_generate_v4(),

    -- Identity / dedup
    source              text        not null,
    external_id         text        not null,
    company             text        not null,
    company_slug        text        not null,

    -- Core fields
    title               text        not null,
    department          text,
    location            text,
    description_html    text,
    source_url          text        not null,

    -- Derived / normalized
    is_qc               boolean     not null default false,
    is_remote           boolean,                              -- null = unknown/hybrid
    seniority           text        check (seniority in (
                            'internship','junior','mid','senior',
                            'lead','staff','principal','manager','director'
                        )),
    tech_stack          text[]      not null default '{}',
    employment_type     text        check (employment_type in (
                            'full-time','part-time','contract','internship'
                        )),

    -- Timestamps
    posted_at           timestamptz,
    fetched_at          timestamptz not null,
    first_seen_at       timestamptz not null,
    last_seen_at        timestamptz not null,

    -- Status
    is_active           boolean     not null default true
);

-- ─── Dedup constraint ────────────────────────────────────────────────────────
-- (source, external_id, company_slug) is the natural key — job IDs are only
-- unique per company within an ATS, not globally.

alter table jobs
    drop constraint if exists jobs_source_external_id_company_slug_key;

alter table jobs
    add constraint jobs_source_external_id_company_slug_key
    unique (source, external_id, company_slug);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index if not exists jobs_is_qc_is_active
    on jobs (is_qc, is_active);

create index if not exists jobs_source_company_slug
    on jobs (source, company_slug);

create index if not exists jobs_fetched_at
    on jobs (fetched_at desc);

create index if not exists jobs_tech_stack_gin
    on jobs using gin (tech_stack);

-- ─── Trigger: preserve first_seen_at on update ───────────────────────────────
-- Supabase upsert sends first_seen_at=now on every call. This trigger silently
-- restores the original value so it's truly "set once on insert, never changed".

create or replace function _preserve_first_seen_at()
returns trigger language plpgsql as $$
begin
    if OLD.first_seen_at is not null then
        NEW.first_seen_at := OLD.first_seen_at;
    end if;
    return NEW;
end;
$$;

drop trigger if exists preserve_first_seen_at on jobs;
create trigger preserve_first_seen_at
    before update on jobs
    for each row execute function _preserve_first_seen_at();

-- ─── Row-Level Security ───────────────────────────────────────────────────────
-- Public read-only. Writes go through service role only (never anon key).

alter table jobs enable row level security;

drop policy if exists "public read" on jobs;
create policy "public read"
    on jobs for select
    using (true);

-- ─── Helpful view ────────────────────────────────────────────────────────────

create or replace view active_qc_jobs as
    select
        id, source, company, title, department, location,
        source_url, is_remote, seniority, tech_stack,
        employment_type, posted_at, first_seen_at
    from jobs
    where is_qc = true
      and is_active = true
    order by first_seen_at desc;
