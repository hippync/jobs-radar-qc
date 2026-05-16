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

  if (filters.tech)      query = query.contains("tech_stack", [filters.tech]);
  if (filters.source)    query = query.eq("source", filters.source);
  if (filters.seniority) query = query.eq("seniority", filters.seniority);
  if (filters.remote === "true")  query = query.eq("is_remote", true);
  else if (filters.remote === "false") query = query.eq("is_remote", false);
  else if (filters.remote === "null")  query = query.is("is_remote", null);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  return { jobs: (data ?? []) as Job[], total: count ?? 0 };
}

async function fetchFilterOptions(): Promise<{ techOptions: string[]; sourceOptions: string[] }> {
  const { data } = await supabase.from("active_qc_jobs").select("tech_stack, source");

  const techSet = new Set<string>();
  const sourceSet = new Set<string>();
  for (const row of data ?? []) {
    for (const t of row.tech_stack ?? []) techSet.add(t);
    if (row.source) sourceSet.add(row.source);
  }

  return { techOptions: [...techSet].sort(), sourceOptions: [...sourceSet].sort() };
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
    const q = new URLSearchParams();
    if (filters.tech)      q.set("tech", filters.tech);
    if (filters.source)    q.set("source", filters.source);
    if (filters.remote)    q.set("remote", filters.remote);
    if (filters.seniority) q.set("seniority", filters.seniority);
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `?${qs}` : "/";
  }

  const hasFilters = !!(filters.tech || filters.source || filters.remote || filters.seniority);

  return (
    <>
      {/* Hero header */}
      <header className="bg-gradient-to-br from-violet-700 to-violet-900">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Jobs Radar QC
          </h1>
          <p className="mt-1 text-sm text-violet-200">
            Active tech jobs in Québec — updated daily from Greenhouse, Lever &amp; Workable.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-200 ring-1 ring-amber-300/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {total} active job{total !== 1 ? "s" : ""}
            </span>
            {hasFilters && (
              <span className="text-xs text-violet-300">
                filtered
              </span>
            )}
            <a
              href="/trends"
              className="inline-flex items-center gap-1 rounded-full bg-violet-600/40 px-3 py-1 text-xs font-medium text-violet-200 ring-1 ring-violet-400/30 transition hover:bg-violet-600/60 hover:text-white"
            >
              Tech Radar →
            </a>
          </div>
        </div>
      </header>

      {/* Sticky filter bar */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <Suspense>
            <JobFilters techOptions={techOptions} sourceOptions={sourceOptions} />
          </Suspense>
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <p className="mb-4 text-sm text-slate-500">
          <span className="font-semibold text-violet-700">{total}</span>{" "}
          job{total !== 1 ? "s" : ""}
          {filters.tech && (
            <> with <span className="font-medium text-slate-700">{filters.tech}</span></>
          )}
          {filters.seniority && (
            <> · <span className="font-medium text-slate-700">{filters.seniority}</span></>
          )}
        </p>

        {jobs.length === 0 ? (
          <p className="py-20 text-center text-slate-400">No jobs match your filters.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-3">
            {page > 1 && (
              <a
                href={pageUrl(page - 1)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:border-violet-300 hover:text-violet-700"
              >
                ← Prev
              </a>
            )}
            <span className="text-sm text-slate-400">{page} / {totalPages}</span>
            {page < totalPages && (
              <a
                href={pageUrl(page + 1)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:border-violet-300 hover:text-violet-700"
              >
                Next →
              </a>
            )}
          </div>
        )}

        <p className="mt-12 text-center text-xs text-slate-300">
          Open source ·{" "}
          <a
            href="https://github.com/hippync/jobs-radar-qc"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-violet-400"
          >
            github.com/hippync/jobs-radar-qc
          </a>
        </p>
      </main>
    </>
  );
}
