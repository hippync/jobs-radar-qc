import type { Metadata } from "next";
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
      <header className="bg-gradient-to-br from-violet-700 to-violet-900">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <nav className="mb-4 text-sm">
            <a href="/" className="text-violet-300 hover:text-white transition">
              ← Back to jobs
            </a>
          </nav>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Tech Stack Radar
          </h1>
          <p className="mt-1 text-sm text-violet-200">
            Most in-demand technologies across {jobCount} active QC tech jobs.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        {techs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <p className="text-slate-500 font-medium">Data accumulating</p>
            <p className="mt-1 text-sm text-slate-400">
              Check back once the daily pipeline has run a few times.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">
                Top {techs.length} technologies
              </h2>
              <span className="text-xs text-slate-400">
                {jobCount} active roles · click to filter
              </span>
            </div>

            <div className="px-6 py-5 space-y-3.5">
              {techs.map(({ tech, count }, i) => (
                <a
                  key={tech}
                  href={`/?tech=${encodeURIComponent(tech)}`}
                  className="flex items-center gap-3 group"
                >
                  {/* Rank */}
                  <span className="w-5 shrink-0 text-right text-xs text-slate-300">
                    {i + 1}
                  </span>

                  {/* Tech name */}
                  <span className="w-28 shrink-0 truncate text-sm font-medium text-slate-700 group-hover:text-violet-600 transition">
                    {tech}
                  </span>

                  {/* Bar */}
                  <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-2">
                    <div
                      className="h-2 rounded-full bg-violet-400 group-hover:bg-violet-500 transition-colors"
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    />
                  </div>

                  {/* Count */}
                  <span className="w-8 shrink-0 text-right text-sm font-semibold text-slate-600">
                    {count}
                  </span>
                </a>
              ))}
            </div>

            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-400">
                Includes rule-based and LLM-enriched tech stacks. Counts reflect active
                jobs only — closed postings are excluded.
              </p>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
