import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  CANONICAL,
  CATEGORY_LABELS,
  DEFAULT_CATS,
  type CatSlug,
  type TechRow,
  catToCssSlug,
  parseCatsParam,
} from "@/lib/radarHelpers";
import {
  fetchRadarData,
  parseWindow,
  VALID_WINDOWS,
} from "@/lib/radarData";
import {
  parseSegment,
  SEGMENT_LABELS,
} from "@/lib/segmentHelpers";
import { RadarCategorySelector } from "@/components/RadarCategorySelector";
import { RadarDownloadPanel } from "@/components/RadarDownloadPanel";
import { SegmentFilter } from "@/components/SegmentFilter";

export const metadata: Metadata = {
  title: "Tech Stack Radar | Jobs Radar /qc",
  description:
    "Most in-demand technologies across active Québec tech roles, visualized as a radial radar.",
};

export const revalidate = 3600;

/* ── Radar SVG ──────────────────────────────────────────────────────────── */
function RadarChart({
  allTechs,
  selectedCats,
}: {
  allTechs: TechRow[];
  selectedCats: string[];
}) {
  const CX = 280, CY = 240, R = 200;
  const RINGS = [0.95, 0.68, 0.42, 0.18];
  const RING_LABELS = ["top 5", "top 10", "top 20", "long tail"];
  /** Top-5 techs globally — used to decide inline label rendering. */
  const TOP5 = new Set(allTechs.slice(0, 5).map((t) => t.name));

  /* ── Group techs by selected sector, capped at 8 per sector ──────────── */
  const byCat: Record<string, TechRow[]> = {};
  for (const cat of selectedCats) {
    byCat[cat] = [];
  }
  for (const t of allTechs) {
    const arr = byCat[t.category];
    if (arr && arr.length < 8) {
      arr.push(t);
    }
  }

  /* ── Place tech bubbles in polar coordinates ─────────────────────────── */
  interface PlacedTech {
    tech: TechRow;
    x: number;
    y: number;
    size: number;
    isTop5: boolean;
    labelSide: "right" | "left";
  }

  const placed: PlacedTech[] = [];

  selectedCats.forEach((cat, catIdx) => {
    const arr = byCat[cat] ?? [];
    const sectorAngle = (Math.PI * 2) / selectedCats.length;
    arr.forEach((tech, i) => {
      const angle =
        -Math.PI / 2 +
        catIdx * sectorAngle +
        (sectorAngle * (i + 1)) / (arr.length + 1);

      // Rank drives radial position: top rank closer to center
      const rankFrac = tech.rank / Math.max(1, allTechs.length);
      const r = R * (0.16 + 0.76 * Math.min(1, rankFrac * 1.8));

      const x = CX + Math.cos(angle) * r;
      const y = CY + Math.sin(angle) * r;
      const size = Math.max(6, Math.min(20, Math.sqrt(tech.count) * 1.3));
      const isTop5 = TOP5.has(tech.name);
      const labelSide = x > CX ? "right" : "left";

      placed.push({ tech, x, y, size, isTop5, labelSide });
    });
  });

  /* ── Total tech count for aria desc ─────────────────────────────────── */
  const visibleCount = placed.length;

  return (
    <svg
      viewBox="0 0 560 480"
      style={{ width: "100%", height: "100%", display: "block" }}
      role="img"
      aria-label="Tech stack radial radar showing technology distribution across Quebec tech jobs"
    >
      <title>Tech Stack Radar — Jobs Radar /qc</title>
      <desc>
        Radial chart showing {visibleCount} technologies grouped into{" "}
        {selectedCats.length} sectors:{" "}
        {selectedCats
          .map((c) => CATEGORY_LABELS[c as CatSlug] ?? c)
          .join(", ")}
        . Bubble size represents posting count; proximity to center represents
        overall rank.
      </desc>

      {/* Concentric rings */}
      {RINGS.map((k, i) => (
        <g key={i}>
          <circle
            cx={CX}
            cy={CY}
            r={R * k}
            fill="none"
            stroke="var(--rule-soft)"
            strokeDasharray="3 5"
            strokeWidth="1"
          />
          <text
            x={CX + R * k + 5}
            y={CY - 5}
            fontFamily="var(--font-mono)"
            fontSize="9"
            fill="var(--ink-mute)"
          >
            {RING_LABELS[i]}
          </text>
        </g>
      ))}

      {/* Sector divider lines */}
      {selectedCats.map((_, i) => {
        const sector = (Math.PI * 2) / selectedCats.length;
        const a0 = -Math.PI / 2 + i * sector;
        return (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={CX + Math.cos(a0) * R}
            y2={CY + Math.sin(a0) * R}
            stroke="var(--rule-soft)"
            strokeWidth="1"
          />
        );
      })}

      {/* Sector labels — colored by category token */}
      {selectedCats.map((cat, i) => {
        const sector = (Math.PI * 2) / selectedCats.length;
        const am = -Math.PI / 2 + i * sector + sector / 2;
        const lx = CX + Math.cos(am) * (R + 26);
        const ly = CY + Math.sin(am) * (R + 26);
        const cssSlug = catToCssSlug(cat);
        const label = CATEGORY_LABELS[cat as CatSlug] ?? cat;
        return (
          <text
            key={cat}
            x={lx}
            y={ly}
            fontFamily="var(--font-sans)"
            fontSize="11"
            fontWeight="600"
            textAnchor="middle"
            fill={`var(--cat-${cssSlug})`}
          >
            {label}
          </text>
        );
      })}

      {/* Decorative sweep line at -32° */}
      <line
        x1={CX}
        y1={CY}
        x2={CX + R}
        y2={CY}
        stroke="var(--accent)"
        strokeWidth="1.25"
        strokeDasharray="2 5"
        opacity="0.45"
        transform={`rotate(-32 ${CX} ${CY})`}
      />

      {/* Center dot */}
      <circle cx={CX} cy={CY} r={5} fill="var(--accent)" />
      <circle
        cx={CX}
        cy={CY}
        r={13}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1"
      />

      {/* Bubbles — colored by category token */}
      {placed.map(({ tech, x, y, size, isTop5, labelSide }) => {
        const cssSlug = catToCssSlug(tech.category);
        const catColor = `var(--cat-${cssSlug}, var(--accent))`;
        const bubbleFill = isTop5
          ? catColor
          : `color-mix(in oklab, ${catColor} 35%, var(--surface))`;
        return (
          <g key={tech.name}>
            <title>
              {tech.name} — {tech.count} roles (rank #{tech.rank})
            </title>
            <a href={`/?tech=${encodeURIComponent(tech.name)}`}>
              <circle
                cx={x}
                cy={y}
                r={size}
                fill={bubbleFill}
                stroke="var(--rule-soft)"
                strokeWidth="1"
                style={{ cursor: "pointer" }}
              />
              {/* Inline labels for top-5 only; others surface via <title> tooltip */}
              {isTop5 && (
                <>
                  <text
                    x={labelSide === "right" ? x + size + 4 : x - size - 4}
                    y={y + 3}
                    fontFamily="var(--font-sans)"
                    fontSize="10.5"
                    fontWeight="600"
                    textAnchor={labelSide === "right" ? "start" : "end"}
                    fill="var(--ink)"
                  >
                    {tech.name}
                  </text>
                  <text
                    x={labelSide === "right" ? x + size + 4 : x - size - 4}
                    y={y + 14}
                    fontFamily="var(--font-mono)"
                    fontSize="8.5"
                    textAnchor={labelSide === "right" ? "start" : "end"}
                    fill="var(--ink-mute)"
                  >
                    {tech.count}
                  </text>
                </>
              )}
            </a>
          </g>
        );
      })}

      {/* Legend */}
      <text
        x="16"
        y="470"
        fontFamily="var(--font-mono)"
        fontSize="9"
        fill="var(--ink-mute)"
      >
        ◯ size = job count · proximity to center = rank · hover for name
      </text>
    </svg>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ cats?: string; window?: string; segment?: string }>;
}) {
  const { cats: catsParam, window: windowParam, segment: segmentParam } = await searchParams;
  const activeWindow = parseWindow(windowParam);
  const activeSegment = parseSegment(segmentParam);

  /** The 4 currently selected category slugs — always length 4. */
  const selectedCats = parseCatsParam(catsParam, CANONICAL, DEFAULT_CATS);

  const { techs: allTechs, jobCount, coMentions } = await fetchRadarData(
    activeWindow,
    activeSegment,
  );

  const top5 = allTechs.slice(0, 5);
  const focusTech = top5[0];
  const focusCoMentions = focusTech ? (coMentions[focusTech.name] ?? []) : [];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 lg:flex-row lg:gap-0">
      {/* ── Main radar area ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col">
        {/* Page header */}
        <div
          className="mb-4 pb-4"
          style={{ borderBottom: "1.5px solid var(--rule-soft)" }}
        >
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
              Tech Stack Radar
            </h1>
            <span
              className="text-xs"
              style={{
                color: "var(--ink-mute)",
                fontFamily: "var(--font-mono)",
              }}
            >
              · {jobCount} active roles · enriched weekly
            </span>
            {/* Time-window pills — preserve ?cats= and ?segment= when switching windows */}
            <nav aria-label="Time window" className="ml-auto flex items-center gap-1.5">
              {VALID_WINDOWS.map((w) => {
                const isActive = w === activeWindow;
                const params = new URLSearchParams();
                params.set("cats", selectedCats.join(","));
                params.set("window", w);
                if (activeSegment) params.set("segment", activeSegment);
                return (
                  <Link
                    key={w}
                    href={`/trends?${params.toString()}`}
                    className="rounded-full px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-1"
                    style={{
                      border: "1px solid var(--rule-soft)",
                      background: isActive ? "var(--accent)" : "transparent",
                      color: isActive ? "white" : "var(--ink-mute)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                    }}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {w}
                  </Link>
                );
              })}
            </nav>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
            {activeSegment
              ? `Technologies most in demand in ${SEGMENT_LABELS[activeSegment] ?? activeSegment} roles`
              : "Technologies across all active QC tech roles"}
            {activeWindow !== "all"
              ? ` · last ${activeWindow}`
              : ""}.{" "}
            Click a bubble to filter jobs.
          </p>
        </div>

        {/* Radar SVG */}
        <div
          className="relative flex-1 rounded-md"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--rule-soft)",
            minHeight: 340,
          }}
        >
          {allTechs.length === 0 ? (
            <div className="flex h-full items-center justify-center py-20 text-center">
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                  Data accumulating
                </p>
                <p className="mt-1 text-sm" style={{ color: "var(--ink-mute)" }}>
                  Check back once the daily pipeline has run.
                </p>
              </div>
            </div>
          ) : (
            <RadarChart allTechs={allTechs} selectedCats={selectedCats} />
          )}
        </div>
      </div>

      {/* ── Side rail ───────────────────────────────────────────────── */}
      <div
        className="mt-4 flex flex-col gap-4 lg:ml-5 lg:mt-0 lg:w-72"
        style={{ flexShrink: 0 }}
      >
        {/* Segment filter — Server Component (Link pills) */}
        <div
          className="rounded-md p-3"
          style={{ background: "var(--bg-2)", border: "1px solid var(--rule-soft)" }}
        >
          <SegmentFilter
            activeSegment={activeSegment}
            selectedCats={selectedCats}
            activeWindow={activeWindow}
          />
        </div>

        {/* Radar sector selector — Client Component */}
        <div
          className="rounded-md p-3"
          style={{ background: "var(--bg-2)", border: "1px solid var(--rule-soft)" }}
        >
          {/*
           * Suspense boundary required because RadarCategorySelector uses
           * useSearchParams() which opts into dynamic rendering client-side.
           * The null fallback avoids layout shift — the server-rendered chips
           * (from selectedCats prop) are shown immediately.
           */}
          <Suspense fallback={null}>
            <RadarCategorySelector selectedCats={selectedCats} />
          </Suspense>
        </div>

        {/* Top technologies */}
        <div
          className="rounded-md p-3"
          style={{ background: "var(--bg-2)", border: "1px solid var(--rule-soft)" }}
        >
          <div className="mb-2 flex items-center gap-2">
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{
                color: "var(--ink-mute)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
              }}
            >
              Top technologies
            </span>
            <span
              className="text-xs"
              style={{
                color: "var(--ink-mute)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
              }}
            >
              · {activeWindow === "all" ? "all time" : `last ${activeWindow}`}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            {allTechs.slice(0, 8).map((t, i) => (
              <Link
                key={t.name}
                href={`/?tech=${encodeURIComponent(t.name)}`}
                className="group flex items-center gap-2 rounded text-xs transition-colors"
                style={{ padding: "2px 0" }}
              >
                <span
                  className="tabular shrink-0"
                  style={{
                    width: 18,
                    textAlign: "right",
                    color: "var(--ink-mute)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                  }}
                >
                  {i + 1}
                </span>
                <span
                  className="flex-1 font-medium"
                  style={{ color: "var(--ink)", fontSize: 12 }}
                >
                  {t.name}
                </span>
                <span
                  className="tabular shrink-0"
                  style={{
                    color: "var(--ink-mute)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                  }}
                >
                  {t.count}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Often paired with */}
        {focusTech && focusCoMentions.length > 0 && (
          <div
            className="rounded-md p-3"
            style={{ background: "var(--bg-2)", border: "1px solid var(--rule-soft)" }}
          >
            <div className="mb-2 flex items-center gap-1">
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{
                  color: "var(--ink-mute)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                }}
              >
                Often paired with{" "}
              </span>
              <span
                className="rounded px-1 text-xs font-semibold"
                style={{
                  background: "var(--accent-12)",
                  color: "var(--accent)",
                  fontSize: 9,
                }}
              >
                {focusTech.name}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {focusCoMentions.map(({ name, pct }) => (
                <Link
                  key={name}
                  href={`/?tech=${encodeURIComponent(name)}`}
                  className="rounded-full px-2 py-0.5 text-xs transition-colors"
                  style={{
                    background: "var(--surface)",
                    color: "var(--ink-soft)",
                    border: "1px solid var(--rule-soft)",
                    fontSize: 10,
                  }}
                >
                  {name}{" "}
                  <span
                    style={{
                      color: "var(--ink-mute)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {pct}%
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Embed / API card — dynamic curl commands */}
        <RadarDownloadPanel cats={selectedCats} segment={activeSegment} />
      </div>
    </div>
  );
}

