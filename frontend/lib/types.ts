// Mirrors the active_qc_jobs view's column list exactly (scripts/migrate_enrichment.sql)
// — every field here must be a real view column, since fields that aren't can
// never be populated at runtime despite TypeScript treating them as present.
export interface Job {
  id: string;
  source: string;
  company: string;
  title: string;
  location: string | null;
  department: string | null;
  source_url: string;
  is_remote: boolean | null;
  seniority: string | null;
  employment_type: string | null;
  tech_stack: string[];
  posted_at: string | null;
  first_seen_at: string;
}
