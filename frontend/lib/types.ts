export interface Job {
  id: string;
  source: string;
  external_id: string;
  company: string;
  company_slug: string;
  title: string;
  location: string | null;
  department: string | null;
  source_url: string;
  is_qc: boolean;
  is_remote: boolean | null;
  seniority: string | null;
  employment_type: string | null;
  tech_stack: string[];
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
}
