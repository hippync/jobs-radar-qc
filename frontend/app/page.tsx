import { Suspense } from "react";
import Link from "next/link";
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
  const to   = from + PAGE_SIZE - 1;

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

async function fetchStats(): Promise<{
  techOptions: string[];
  sourceOptions: string[];
  companyCount: number;
}> {
  const { data } = await supabase
    .from("active_qc_jobs")
    .select("tech_stack, source, company");

  const techSet    = new Set<string>();
  const sourceSet  = new Set<string>();
  const companySet = new Set<string>();

  for (const row of data ?? []) {
    for (const t of row.tech_stack ?? []) techSet.add(t);
    if (row.source)  sourceSet.add(row.source);
    if (row.company) companySet.add(row.company);
  }

  return {
    techOptions:  [...techSet].sort(),
    sourceOptions: [...sourceSet].sort(),
    companyCount: companySet.size,
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = await searchParams;
  const page    = Math.max(1, parseInt(filters.page ?? "1", 10));

  const [{ jobs, total }, { techOptions, sourceOptions, companyCount }] =
    await Promise.all([fetchJobs(filters), fetchStats()]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = !!(filters.tech || filters.source || filters.remote || filters.seniority);

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

  return (
    <>
      {/* Page header */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
            The Quebec tech job market, indexed daily.
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-zinc-500">
            Track what Quebec tech companies are hiring for — directly from Greenhouse, Lever,
            and Workable ATS pages. No aggregators, no sponsored posts.
          </p>

          {/* Stats row */}
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-zinc-100 pt-4 text-sm text-zinc-500">
            <span>
              <span className="font-semibold text-zinc-950">{total}</span>{" "}
              {hasFilters ? "matching" : "active"} role{total !== 1 ? "s" : ""}
            </span>
            <span>
              <span className="font-semibold text-zinc-950">{companyCount}</span>{" "}
              companies tracked
            </span>
            <span>
              <span className="font-semibold text-zinc-950">3</span>{" "}
              ATS platforms
            </span>
          </div>
        </div>
      </header>

      {/* Sticky filter bar */}
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-4 py-2.5">
          <Suspense>
            <JobFilters techOptions={techOptions} sourceOptions={sourceOptions} />
          </Suspense>
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center py-24 text-center">
            <p className="text-sm font-medium text-zinc-950">
              No jobs match these filters.
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              Try clearing filters or check back after the next daily fetch.
            </p>
            {hasFilters && (
              <Link
                href="/"
                className="mt-4 rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition-colors hover:border-blue-200 hover:text-blue-600"
              >
                Clear filters
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-3">
            {page > 1 && (
              <a
                href={pageUrl(page - 1)}
                className="rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition-colors hover:border-blue-200 hover:text-blue-600"
              >
                ← Prev
              </a>
            )}
            <span className="text-sm tabular-nums text-zinc-400">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <a
                href={pageUrl(page + 1)}
                className="rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition-colors hover:border-blue-200 hover:text-blue-600"
              >
                Next →
              </a>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-100 py-6">
        <p className="text-center text-xs text-zinc-400">
          Open source ·{" "}
          <a
            href="https://github.com/hippync/jobs-radar-qc"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-blue-500"
          >
            github.com/hippync/jobs-radar-qc
          </a>
        </p>
      </footer>
    </>
  );
}
