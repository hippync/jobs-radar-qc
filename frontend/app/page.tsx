import type { Metadata } from "next";
import { SHARED_OG } from "@/lib/siteMetadata";
import { Suspense } from "react";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";
import { Job } from "@/lib/types";
import JobCard from "@/components/JobCard";
import KpiStrip from "@/components/KpiStrip";
import FilterSidebar from "@/components/FilterSidebar";
import ActiveFilterChips from "@/components/ActiveFilterChips";
import MobileFilterDrawer from "@/components/MobileFilterDrawer";

export const metadata: Metadata = {
  title: "Tech Jobs in Montreal and Quebec",
  description:
    "Track active tech roles, companies, sources, and skills across Quebec.",
  openGraph: {
    ...SHARED_OG,
    title: "Tech Jobs in Montreal and Quebec",
    description:
      "Track active tech roles, companies, sources, and skills across Quebec.",
    url: "/",
  },
  alternates: {
    canonical: "/",
  },
};

const PAGE_SIZE = 30;
const CACHE_SECONDS = 900;

interface SearchParams {
  tech?: string;
  source?: string;
  remote?: string;
  seniority?: string;
  sort?: string;
  page?: string;
}

interface Stats {
  techOptions: string[];
  sourceOptions: string[];
  companyCount: number;
  newTodayCount: number;
  remotePercent: number;
  sourceCounts: Record<string, number>;
  seniorityCounts: Record<string, number>;
  workplaceCounts: Record<string, number>;
  lastUpdated: string | null;
}

// Shape returned by the get_homepage_stats() Supabase RPC.
// All aggregation is done DB-side — no row data is transferred.
interface DbStats {
  new_today:        number;
  company_count:    number;
  remote_percent:   number;
  source_counts:    Record<string, number>;
  seniority_counts: Record<string, number>;
  workplace_counts: Record<string, number>;
  source_options:   string[];
  tech_options:     string[];
  last_updated:     string | null;
}

// Contextual facet counts — each facet excludes its own active filter so the
// count for value V reflects "how many jobs match active filters + V".
interface FacetCounts {
  sourceCounts:    Record<string, number>;
  seniorityCounts: Record<string, number>;
  workplaceCounts: Record<string, number>;
}

// Shape returned by the get_contextual_facets() Supabase RPC.
interface DbFacetCounts {
  source_counts:    Record<string, number>;
  seniority_counts: Record<string, number>;
  workplace_counts: Record<string, number>;
}

function normalizeFilters(filters: SearchParams): Required<SearchParams> {
  return {
    tech:      filters.tech      ?? "",
    source:    filters.source    ?? "",
    remote:    filters.remote    ?? "",
    seniority: filters.seniority ?? "",
    sort:      filters.sort === "asc" ? "asc" : "desc",
    page:      String(Math.max(1, parseInt(filters.page ?? "1", 10))),
  };
}

const fetchJobsCached = unstable_cache(
  async (
    tech: string,
    source: string,
    remote: string,
    seniority: string,
    sort: string,
    pageValue: string,
  ): Promise<{ jobs: Job[]; total: number }> => {
    const page = Math.max(1, parseInt(pageValue, 10));
    const from = (page - 1) * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    let query = supabase
      .from("active_qc_jobs")
      .select("*", { count: "exact" })
      .order("first_seen_at", { ascending: sort === "asc" })
      .range(from, to);

    if (tech)      query = query.contains("tech_stack", [tech]);
    if (source)    query = query.eq("source", source);
    if (seniority) query = query.eq("seniority", seniority);
    if (remote === "true")  query = query.eq("is_remote", true);
    else if (remote === "false") query = query.eq("is_remote", false);
    else if (remote === "null")  query = query.is("is_remote", null);

    const { data, count, error } = await query;
    if (error) throw new Error(error.message);

    return { jobs: (data ?? []) as Job[], total: count ?? 0 };
  },
  ["homepage-jobs-v1"],
  { revalidate: CACHE_SECONDS },
);

async function fetchJobs(filters: SearchParams): Promise<{ jobs: Job[]; total: number }> {
  const normalized = normalizeFilters(filters);
  return fetchJobsCached(
    normalized.tech,
    normalized.source,
    normalized.remote,
    normalized.seniority,
    normalized.sort,
    normalized.page,
  );
}

// Calls the get_homepage_stats() Supabase RPC.
// All aggregation runs in the database — no job rows are transferred to the client.
// See scripts/migrate_stats_rpc.sql for the SQL definition and how to apply it.
const fetchStatsCached = unstable_cache(async (): Promise<Stats> => {
  const { data, error } = await supabase.rpc("get_homepage_stats");

  if (error) {
    // Log the error but return safe zero-state so the page still renders.
    // Filter sidebar will be empty; KPI strip will show zeros.
    console.error("[fetchStats] RPC error:", error.message);
    return {
      techOptions:     [],
      sourceOptions:   [],
      companyCount:    0,
      newTodayCount:   0,
      remotePercent:   0,
      sourceCounts:    {},
      seniorityCounts: {},
      workplaceCounts: {},
      lastUpdated:     null,
    };
  }

  const db = (data ?? {}) as DbStats;

  return {
    techOptions:     db.tech_options      ?? [],
    sourceOptions:   db.source_options    ?? [],
    companyCount:    db.company_count     ?? 0,
    newTodayCount:   db.new_today         ?? 0,
    remotePercent:   db.remote_percent    ?? 0,
    sourceCounts:    db.source_counts     ?? {},
    seniorityCounts: db.seniority_counts  ?? {},
    workplaceCounts: db.workplace_counts  ?? {},
    lastUpdated:     db.last_updated      ?? null,
  };
}, ["homepage-stats-v1"], { revalidate: CACHE_SECONDS });

async function fetchStats(): Promise<Stats> {
  return fetchStatsCached();
}

// Calls the get_contextual_facets() Supabase RPC.
// Each facet count is computed with all OTHER active filters applied — never
// double-counting the facet's own filter — so counts reflect what the user
// would get by clicking that value.  All NULL params → global totals.
const fetchContextualFacetsCached = unstable_cache(
  async (
    tech: string,
    source: string,
    remote: string,
    seniority: string,
  ): Promise<FacetCounts> => {
    const { data, error } = await supabase.rpc("get_contextual_facets", {
      p_tech:      tech      || null,
      p_source:    source    || null,
      p_remote:    remote    || null,
      p_seniority: seniority || null,
    });

    if (error) {
      console.error("[fetchContextualFacets] RPC error:", error.message);
      return { sourceCounts: {}, seniorityCounts: {}, workplaceCounts: {} };
    }

    const db = (data ?? {}) as DbFacetCounts;
    return {
      sourceCounts:    db.source_counts    ?? {},
      seniorityCounts: db.seniority_counts ?? {},
      workplaceCounts: db.workplace_counts ?? {},
    };
  },
  ["homepage-facets-v1"],
  { revalidate: CACHE_SECONDS },
);

async function fetchContextualFacets(filters: SearchParams, stats: Stats): Promise<FacetCounts> {
  const normalized = normalizeFilters(filters);
  if (!normalized.tech && !normalized.source && !normalized.remote && !normalized.seniority) {
    return {
      sourceCounts:    stats.sourceCounts,
      seniorityCounts: stats.seniorityCounts,
      workplaceCounts: stats.workplaceCounts,
    };
  }

  return fetchContextualFacetsCached(
    normalized.tech,
    normalized.source,
    normalized.remote,
    normalized.seniority,
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = await searchParams;
  const page    = Math.max(1, parseInt(filters.page ?? "1", 10));

  const [{ jobs, total }, stats] = await Promise.all([
    fetchJobs(filters),
    fetchStats(),
  ]);
  const facets = await fetchContextualFacets(filters, stats);

  // Ensure every known source and workplace option has an explicit count (0 if
  // the combination yields no results) so FilterChip always shows a number.
  const sourceCounts = Object.fromEntries(
    stats.sourceOptions.map((s) => [s, facets.sourceCounts[s] ?? 0])
  );
  const workplaceCounts: Record<string, number> = {
    "true":  facets.workplaceCounts["true"]  ?? 0,
    "false": facets.workplaceCounts["false"] ?? 0,
    "null":  facets.workplaceCounts["null"]  ?? 0,
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = !!(filters.tech || filters.source || filters.remote || filters.seniority);
  const activeFilterCount = [filters.tech, filters.source, filters.remote, filters.seniority].filter(Boolean).length;

  const currentSort = filters.sort === "asc" ? "asc" : "desc";

  function pageUrl(p: number) {
    const q = new URLSearchParams();
    if (filters.tech)             q.set("tech",      filters.tech);
    if (filters.source)           q.set("source",    filters.source);
    if (filters.remote)           q.set("remote",    filters.remote);
    if (filters.seniority)        q.set("seniority", filters.seniority);
    if (currentSort !== "desc")   q.set("sort",      currentSort);
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `?${qs}` : "/";
  }

  function sortUrl() {
    const q = new URLSearchParams();
    if (filters.tech)      q.set("tech",      filters.tech);
    if (filters.source)    q.set("source",    filters.source);
    if (filters.remote)    q.set("remote",    filters.remote);
    if (filters.seniority) q.set("seniority", filters.seniority);
    const nextSort = currentSort === "asc" ? "desc" : "asc";
    if (nextSort !== "desc") q.set("sort", nextSort);
    const qs = q.toString();
    return qs ? `?${qs}` : "/";
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 px-4 py-6">
      {/* ── Desktop sidebar ───────────────────────────────────────────── */}
      <aside
        className="hidden w-56 shrink-0 pr-6 lg:block sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto"
        aria-label="Filter panel"
      >
        {/* Sidebar header */}
        <div className="mb-4">
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 10 }}
          >
            Filters
          </p>
        </div>

        <Suspense>
          <FilterSidebar
            techOptions={stats.techOptions}
            sourceOptions={stats.sourceOptions}
            sourceCounts={sourceCounts}
            seniorityCounts={facets.seniorityCounts}
            workplaceCounts={workplaceCounts}
          />
        </Suspense>

        {/* Save-as-alert CTA */}
        <div
          className="mt-6 rounded-md px-3 py-3 text-xs"
          style={{
            border: "1.5px dashed var(--accent)",
            color: "var(--accent)",
            background: "var(--accent-12)",
          }}
        >
          <p className="font-semibold" style={{ fontSize: 11 }}>★ Save as alert</p>
          <p className="mt-0.5" style={{ color: "var(--ink-soft)", fontSize: 10 }}>
            Get email notifications when new roles match this search.
          </p>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        {/* KPI strip */}
        <div className="mb-5">
          <KpiStrip
            activeRoles={stats.companyCount > 0 ? total : 0}
            newToday={stats.newTodayCount}
            companies={stats.companyCount}
            remotePercent={stats.remotePercent}
            hasFilters={hasFilters}
            lastUpdated={stats.lastUpdated}
          />
        </div>

        {/* Mobile: search row + filter drawer trigger */}
        <div className="mb-3 flex items-center gap-2 lg:hidden">
          <Suspense>
            <MobileFilterDrawer
              techOptions={stats.techOptions}
              sourceOptions={stats.sourceOptions}
              sourceCounts={sourceCounts}
              seniorityCounts={facets.seniorityCounts}
              workplaceCounts={workplaceCounts}
              activeFilterCount={activeFilterCount}
            />
          </Suspense>

          <span
            className="text-xs tabular"
            style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 11 }}
          >
            {total} role{total !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Active filter chips */}
        {hasFilters && (
          <div className="mb-3">
            <Suspense>
              <ActiveFilterChips />
            </Suspense>
          </div>
        )}

        {/* Results header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h1
              className="text-sm font-semibold"
              style={{ color: "var(--ink)", fontSize: 13 }}
            >
              {hasFilters ? `${total} matching role${total !== 1 ? "s" : ""}` : `${total} active role${total !== 1 ? "s" : ""}`}
            </h1>
            <span
              className="text-xs"
              style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 10 }}
            >
              · {stats.companyCount} companies · updated daily
            </span>
          </div>
          <a
            href={sortUrl()}
            aria-label={
              currentSort === "asc"
                ? "↑ Date — sorted oldest first, click for newest first"
                : "↓ Date — sorted newest first, click for oldest first"
            }
            title={currentSort === "asc" ? "Plus récents en premier" : "Plus anciens en premier"}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
            style={{
              border: "1px solid var(--rule-soft)",
              color: "var(--ink-soft)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
          >
            {currentSort === "asc" ? "↑" : "↓"} Date
          </a>
        </div>

        {/* Jobs grid or empty state */}
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              No jobs match these filters.
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-mute)" }}>
              Try clearing filters or check back after the next daily fetch.
            </p>
            {hasFilters && (
              <Link
                href="/"
                className="mt-4 rounded-md px-4 py-2 text-sm transition-colors"
                style={{
                  border: "1px solid var(--rule-soft)",
                  color: "var(--ink-soft)",
                }}
              >
                Clear filters
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <nav
            className="mt-10 flex items-center justify-center gap-3"
            aria-label="Pagination"
          >
            {page > 1 ? (
              <a
                href={pageUrl(page - 1)}
                className="rounded-md px-4 py-2 text-sm transition-colors"
                aria-label="Go to previous page"
                style={{
                  border: "1px solid var(--rule-soft)",
                  color: "var(--ink-soft)",
                }}
              >
                ← Prev
              </a>
            ) : (
              <span
                className="rounded-md px-4 py-2 text-sm"
                aria-disabled="true"
                aria-label="Previous page (unavailable)"
                style={{ border: "1px solid transparent", color: "var(--ink-mute)" }}
              >
                ← Prev
              </span>
            )}

            <span
              className="text-sm tabular"
              aria-current="page"
              aria-label={`Page ${page} of ${totalPages}`}
              style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 12 }}
            >
              {page} / {totalPages}
            </span>

            {page < totalPages ? (
              <a
                href={pageUrl(page + 1)}
                className="rounded-md px-4 py-2 text-sm transition-colors"
                aria-label="Go to next page"
                style={{
                  border: "1px solid var(--rule-soft)",
                  color: "var(--ink-soft)",
                }}
              >
                Next →
              </a>
            ) : (
              <span
                className="rounded-md px-4 py-2 text-sm"
                aria-disabled="true"
                aria-label="Next page (unavailable)"
                style={{ border: "1px solid transparent", color: "var(--ink-mute)" }}
              >
                Next →
              </span>
            )}
          </nav>
        )}
      </div>
    </main>
  );
}
