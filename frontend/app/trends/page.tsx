import type { Metadata } from "next";
import React from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Tech Stack Radar — Jobs Radar QC",
  description: "Most in-demand technologies across active Québec tech jobs.",
};

// Revalidate once per hour — data changes only when the daily pipeline runs.
export const revalidate = 3600;

interface TechCount {
  tech: string;
  count: number;
}

async function fetchDistribution(): Promise<{ techs: TechCount[]; jobCount: number }> {
  const { data, error } = await supabase
    .from("active_qc_jobs")
    .select("tech_stack");

  if (error || !data) return { techs: [], jobCount: 0 };

  const counts: Record<string, number> = {};
  for (const row of data) {
    for (const tech of (row.tech_stack as string[]) ?? []) {
      counts[tech] = (counts[tech] ?? 0) + 1;
    }
  }

  // TODO: once first_seen_at history >= 30 days, add delta comparison:
  // fetch jobs where first_seen_at >= now()-30d and now()-60d to now()-30d,
  // compute delta per tech, show ↑/↓ badge sorted by delta as tiebreaker.
  const techs = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tech, count]) => ({ tech, count }));

  return { techs, jobCount: data.length };
}

export default async function TrendsPage() {
  const { techs, jobCount } = await fetchDistribution();
  const maxCount = techs[0]?.count ?? 1;

  return (
    <>
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <nav className="mb-3">
            <Link
              href="/"
              className="text-sm text-zinc-400 transition-colors hover:text-zinc-950"
            >
              ← Jobs
            </Link>
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
            Tech Stack Radar
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            How many active QC tech roles list each technology. Click a row to filter jobs.
            Updated daily.
          </p>
          <p className="mt-3 text-sm text-zinc-400">
            <span className="font-medium text-zinc-700">{jobCount}</span> active roles indexed
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        {techs.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
            <p className="text-sm font-medium text-zinc-950">Data accumulating</p>
            <p className="mt-1 text-sm text-zinc-400">
              Check back once the daily pipeline has run a few times.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {/* Table header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Top {techs.length} technologies
              </h2>
              <span className="text-xs text-zinc-400">roles · click to filter</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-zinc-50">
              {techs.map(({ tech, count }, i) => (
                <React.Fragment key={tech}>
                  {/* Tier break after top 5 */}
                  {i === 5 && (
                    <div className="border-t border-zinc-200 bg-zinc-50 px-5 py-1.5">
                      <span className="text-xs font-medium text-zinc-400">Emerging</span>
                    </div>
                  )}
                  <a
                    href={`/?tech=${encodeURIComponent(tech)}`}
                    className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-zinc-50"
                  >
                    {/* Rank */}
                    <span className="w-5 shrink-0 text-right text-xs tabular-nums text-zinc-300">
                      {i + 1}
                    </span>

                    {/* Tech name */}
                    <span className="w-28 shrink-0 truncate text-sm font-medium text-zinc-800 transition-colors group-hover:text-blue-600">
                      {tech}
                    </span>

                    {/* Bar */}
                    <div className="flex-1 overflow-hidden rounded-full bg-zinc-100 h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-colors ${
                          i < 5
                            ? "bg-blue-500 group-hover:bg-blue-600"
                            : "bg-blue-300 group-hover:bg-blue-400"
                        }`}
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>

                    {/* Count */}
                    <span className="w-8 shrink-0 text-right text-sm tabular-nums text-zinc-500">
                      {count}
                    </span>
                  </a>
                </React.Fragment>
              ))}
            </div>

            {/* Footer note */}
            <div className="border-t border-zinc-100 bg-zinc-50 px-5 py-3">
              <p className="text-xs text-zinc-400">
                Includes rule-based and LLM-enriched tech stacks. Counts reflect active
                jobs only — closed postings are excluded.
              </p>
            </div>
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
