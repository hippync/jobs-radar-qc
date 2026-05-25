/**
 * radarData.ts — server-side data fetching for the Tech Stack Radar.
 *
 * Shared between:
 *   - frontend/app/trends/page.tsx  (Server Component)
 *   - frontend/app/api/radar/route.ts  (Route Handler)
 *
 * This module must never be imported by client components — it calls Supabase
 * and may only run server-side.
 */

import { supabase } from "@/lib/supabase";
import { buildTechToCatMap, CANONICAL, type TechRow } from "@/lib/radarHelpers";
import { classifySegment } from "@/lib/segmentHelpers";

/* ── Reverse lookup: tech name → canonical category slug ──────────────── */
const TECH_TO_CAT: Record<string, string> = buildTechToCatMap(CANONICAL);

function getCategory(tech: string): string {
  return TECH_TO_CAT[tech] ?? "other";
}

/* ── Time-window options ─────────────────────────────────────────────── */
export const VALID_WINDOWS = ["7d", "30d", "90d", "all"] as const;
export type WindowOption = (typeof VALID_WINDOWS)[number];

export function parseWindow(raw: string | undefined): WindowOption {
  return (VALID_WINDOWS as readonly string[]).includes(raw ?? "")
    ? (raw as WindowOption)
    : "30d";
}

function windowCutoff(w: WindowOption): string | null {
  if (w === "all") return null;
  const days = w === "7d" ? 7 : w === "30d" ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

/* ── Fetch ──────────────────────────────────────────────────────────────── */
/**
 * Fetch all radar data from active_qc_jobs.
 *
 * Returns ALL technologies (not filtered by cats) ranked by frequency.
 * Callers filter by selectedCats at the rendering/API response layer so
 * both /trends and /api/radar operate on the same underlying dataset.
 *
 * @param window   Time window for first_seen_at filtering (default "30d").
 * @param segment  Optional role segment slug — if provided, only jobs whose
 *                 tech_stack classifies to that segment are included in the
 *                 frequency count. null / undefined = no segment filter.
 */
export async function fetchRadarData(
  window: WindowOption = "30d",
  segment?: string | null,
): Promise<{
  techs: TechRow[];
  jobCount: number;
  coMentions: Record<string, Array<{ name: string; pct: number }>>;
}> {
  const cutoff = windowCutoff(window);
  let query = supabase.from("active_qc_jobs").select("tech_stack");
  if (cutoff) query = query.gte("first_seen_at", cutoff);
  const { data, error } = await query;

  if (error || !data) return { techs: [], jobCount: 0, coMentions: {} };

  // Apply segment filter if requested — classification is computed from
  // tech_stack in TypeScript; no extra DB column or query needed.
  const rows = segment
    ? data.filter(
        (row) =>
          classifySegment((row.tech_stack as string[]) ?? []) === segment,
      )
    : data;

  // Count frequency per tech
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const tech of (row.tech_stack as string[]) ?? []) {
      counts[tech] = (counts[tech] ?? 0) + 1;
    }
  }

  // Compute co-occurrences
  const coOccurrence: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    const stack = (row.tech_stack as string[]) ?? [];
    for (let i = 0; i < stack.length; i++) {
      for (let j = i + 1; j < stack.length; j++) {
        const a = stack[i], b = stack[j];
        if (!coOccurrence[a]) coOccurrence[a] = {};
        if (!coOccurrence[b]) coOccurrence[b] = {};
        coOccurrence[a][b] = (coOccurrence[a][b] ?? 0) + 1;
        coOccurrence[b][a] = (coOccurrence[b][a] ?? 0) + 1;
      }
    }
  }

  // Build ranked tech list (all techs, no global cap — radar caps per sector)
  const all = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count], i) => ({
      name,
      count,
      rank: i + 1,
      category: getCategory(name),
    }));

  // Co-mentions as percentage of the tech's own count (top 8 per tech)
  const coMentions: Record<string, Array<{ name: string; pct: number }>> = {};
  for (const [tech, mentions] of Object.entries(coOccurrence)) {
    const base = counts[tech] ?? 1;
    coMentions[tech] = Object.entries(mentions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, c]) => ({ name, pct: Math.round((c / base) * 100) }));
  }

  return { techs: all, jobCount: rows.length, coMentions };
}
