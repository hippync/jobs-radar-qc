import { Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { Job } from "@/lib/types";
import JobCard from "@/components/JobCard";
import JobFilters from "@/components/JobFilters";

const PAGE_SIZE = 30;

interface SearchParams {
  tech?: string;
  source?: string;
  remote?: string;
  seniority?: string;
  page?: string;
}

async function fetchJobs(filters: SearchParams): Promise<{ jobs: Job[]; total: number }> {
  const page = Math.max(1, parseInt(filters.page ?? "1", 10));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("active_qc_jobs")
    .select("*", { count: "exact" })
    .order("first_seen_at", { ascending: false })
    .range(from, to);

  if (filters.tech) {
    query = query.contains("tech_stack", [filters.tech]);
  }
  if (filters.source) {
    query = query.eq("source", filters.source);
  }
  if (filters.seniority) {
    query = query.eq("seniority", filters.seniority);
  }
  if (filters.remote === "true") {
    query = query.eq("is_remote", true);
  } else if (filters.remote === "false") {
    query = query.eq("is_remote", false);
  } else if (filters.remote === "null") {
    query = query.is("is_remote", null);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  return { jobs: (data ?? []) as Job[], total: count ?? 0 };
}

async function fetchFilterOptions(): Promise<{ techOptions: string[]; sourceOptions: string[] }> {
  const { data } = await supabase
    .from("active_qc_jobs")
    .select("tech_stack, source");

  const techSet = new Set<string>();
  const sourceSet = new Set<string>();

  for (const row of data ?? []) {
    for (const t of row.tech_stack ?? []) techSet.add(t);
    if (row.source) sourceSet.add(row.source);
  }

  return {
    techOptions: [...techSet].sort(),
    sourceOptions: [...sourceSet].sort(),
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = await searchParams;
  const page = Math.max(1, parseInt(filters.page ?? "1", 10));

  const [{ jobs, total }, { techOptions, sourceOptions }] = await Promise.all([
    fetchJobs(filters),
    fetchFilterOptions(),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (filters.tech) params.set("tech", filters.tech);
    if (filters.source) params.set("source", filters.source);
    if (filters.remote) params.set("remote", filters.remote);
    if (filters.seniority) params.set("seniority", filters.seniority);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `?${qs}` : "/";
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Jobs Radar QC</h1>
        <p className="mt-1 text-sm text-gray-500">
          Active tech jobs in Québec — updated daily from Greenhouse, Lever, and Workable.
        </p>
      </div>

      <div className="mb-6">
        <Suspense>
          <JobFilters techOptions={techOptions} sourceOptions={sourceOptions} />
        </Suspense>
      </div>

      <p className="mb-4 text-sm text-gray-500">
        {total} job{total !== 1 ? "s" : ""}
        {filters.tech ? ` with ${filters.tech}` : ""}
        {filters.seniority ? ` · ${filters.seniority}` : ""}
      </p>

      {jobs.length === 0 ? (
        <p className="py-16 text-center text-gray-400">No jobs match your filters.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          {page > 1 && (
            <a
              href={pageUrl(page - 1)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              ← Prev
            </a>
          )}
          <span className="text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <a
              href={pageUrl(page + 1)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Next →
            </a>
          )}
        </div>
      )}
    </main>
  );
}
