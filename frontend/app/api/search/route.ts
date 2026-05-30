/**
 * GET /api/search?q=<query>
 *
 * Full-database job search. Queries the active_qc_jobs view by title/company
 * (ilike) and by exact tech stack match (contains) in parallel, merges,
 * deduplicates, and returns up to 10 results. No SQL migration required.
 *
 * Rules:
 * - query < 2 chars → empty results (not an error)
 * - query trimmed before use; never passed raw to DB
 * - stack traces never surface in responses
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RESULT_LIMIT = 10;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder";

interface SearchResult {
  id: string;
  title: string;
  company: string;
  source: string;
  source_url: string;
  tech_stack: string[];
}

const SELECT = "id,title,company,source,source_url,tech_stack";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // Capitalize first letter so "react" matches the canonical "React".
  const techQuery = q.charAt(0).toUpperCase() + q.slice(1);

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const [textRes, techRes] = await Promise.all([
      supabase
        .from("active_qc_jobs")
        .select(SELECT)
        .or(`title.ilike.%${q}%,company.ilike.%${q}%`)
        .order("first_seen_at", { ascending: false })
        .limit(RESULT_LIMIT),

      supabase
        .from("active_qc_jobs")
        .select(SELECT)
        .contains("tech_stack", [techQuery])
        .order("first_seen_at", { ascending: false })
        .limit(RESULT_LIMIT),
    ]);

    if (textRes.error && techRes.error) {
      return NextResponse.json({ error: "Search unavailable." }, { status: 502 });
    }

    const seen = new Set<string>();
    const merged: SearchResult[] = [];

    for (const row of [...(textRes.data ?? []), ...(techRes.data ?? [])]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row as SearchResult);
      if (merged.length >= RESULT_LIMIT) break;
    }

    return NextResponse.json(
      { results: merged },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json({ error: "Search unavailable." }, { status: 500 });
  }
}
