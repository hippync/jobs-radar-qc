/**
 * GET /api/radar
 *
 * Returns radar data as JSON or as a standalone SVG image.
 *
 * Query parameters
 * ────────────────
 * format   (optional) "json" | "svg"        — default: "json"
 * cats     (optional) comma-separated canonical category slugs
 *                     — default: "languages,frontend,devops,data"
 * window   (optional) "7d" | "30d" | "90d" | "all"  — default: "30d"
 * segment  (optional) role segment slug to filter jobs before aggregation
 *                     — one of: startup_saas, enterprise, ai_ml,
 *                       cloud_platform, consulting, fintech, mobile
 *                     — omit or "all" = no segment filter
 *                     — unrecognised value falls back to no filter (not 400)
 *
 * Examples
 * ────────
 * /api/radar?format=json&cats=languages,frontend,devops,data
 * /api/radar?format=svg&cats=languages,backend,testing,mobile
 * /api/radar?format=json&segment=ai_ml&cats=languages,backend,data,cloud
 * /api/radar?format=svg&segment=mobile
 * /api/radar?format=json&segment=cloud_platform&window=90d
 *
 * ISR: revalidate every hour — matches /trends page cache TTL.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  CANONICAL,
  DEFAULT_CATS,
  parseCatsParam,
  renderRadarSvg,
} from "@/lib/radarHelpers";
import { fetchRadarData, parseWindow } from "@/lib/radarData";
import { parseSegment, SEGMENT_LABELS } from "@/lib/segmentHelpers";

export const revalidate = 3600;

/** SVG returned when Supabase is unreachable or returns no data. */
const SVG_ERROR = `<svg viewBox="0 0 560 480" xmlns="http://www.w3.org/2000/svg">
  <rect width="560" height="480" fill="#0d1117"/>
  <text x="280" y="240" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#6e7681">
    Radar data temporarily unavailable
  </text>
</svg>`;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;

  /* ── Validate ?format= ──────────────────────────────────────────────── */
  const format = searchParams.get("format") ?? "json";
  if (format !== "json" && format !== "svg") {
    return NextResponse.json(
      { error: "Unsupported format. Accepted values: json, svg." },
      { status: 400 },
    );
  }

  /* ── Parse and validate ?cats= via shared helper ─────────────────────── */
  const catsRaw = searchParams.get("cats") ?? undefined;
  const cats = parseCatsParam(catsRaw, CANONICAL, DEFAULT_CATS);

  /* ── Parse ?window= ─────────────────────────────────────────────────── */
  const windowRaw = searchParams.get("window") ?? undefined;
  const window = parseWindow(windowRaw);

  /* ── Parse ?bg= — controls SVG background color ─────────────────────── */
  const bgRaw = searchParams.get("bg");
  const bg: "light" | "dark" = bgRaw === "light" ? "light" : "dark";

  /* ── Parse ?segment= — invalid falls back to null (no filter) ────────── */
  const segmentRaw = searchParams.get("segment");
  const segment = parseSegment(segmentRaw);

  /* ── Fetch radar data ───────────────────────────────────────────────── */
  let fetchResult: Awaited<ReturnType<typeof fetchRadarData>>;
  try {
    fetchResult = await fetchRadarData(window, segment);
  } catch {
    if (format === "svg") {
      return new NextResponse(SVG_ERROR, {
        status: 500,
        headers: svgHeaders(),
      });
    }
    return NextResponse.json(
      { error: "Failed to fetch radar data." },
      { status: 500 },
    );
  }

  const { techs: allTechs, jobCount, coMentions } = fetchResult;

  /* ── SVG response ───────────────────────────────────────────────────── */
  if (format === "svg") {
    let svg: string;
    try {
      svg = renderRadarSvg(allTechs, cats, bg);
    } catch {
      svg = SVG_ERROR;
    }
    return new NextResponse(svg, { status: 200, headers: svgHeaders() });
  }

  /* ── JSON response ──────────────────────────────────────────────────── */
  // Filter techs to the selected categories only, preserving rank order.
  const catSet = new Set(cats);
  const filteredTechs = allTechs.filter((t) => catSet.has(t.category));

  // Co-mentions restricted to techs in the selected categories.
  const filteredCoMentions: Record<
    string,
    Array<{ name: string; pct: number }>
  > = {};
  for (const t of filteredTechs) {
    filteredCoMentions[t.name] = coMentions[t.name] ?? [];
  }

  return NextResponse.json(
    {
      cats,
      window,
      segment: segment ?? "all",
      segmentLabel: segment ? (SEGMENT_LABELS[segment] ?? null) : null,
      jobCount,
      generatedAt: new Date().toISOString(),
      techs: filteredTechs,
      coMentions: filteredCoMentions,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function svgHeaders(): HeadersInit {
  return {
    "Content-Type": "image/svg+xml",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
  };
}
