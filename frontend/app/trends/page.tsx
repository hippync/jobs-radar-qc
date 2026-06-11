import type { Metadata } from "next";
import Link from "next/link";
import { SHARED_OG } from "@/lib/siteMetadata";
import { Suspense } from "react";
import {
  CANONICAL,
  DEFAULT_CATS,
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
import { RadarBgContainer } from "@/components/RadarBgContainer";
import { RadarCategorySelector } from "@/components/RadarCategorySelector";
import { RadarChartClient } from "@/components/RadarChartClient";
import { RadarDownloadPanel } from "@/components/RadarDownloadPanel";
import { SegmentFilter } from "@/components/SegmentFilter";

export const metadata: Metadata = {
  title: "Tech Radar",
  description:
    "Explore the technologies most requested in Quebec tech job postings.",
  openGraph: {
    ...SHARED_OG,
    title: "Tech Radar",
    description:
      "Explore the technologies most requested in Quebec tech job postings.",
    url: "/trends",
  },
  alternates: {
    canonical: "/trends",
  },
};

export const revalidate = 3600;

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
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6">
      {/* ── Segment filter — full width above the radar ──────────────── */}
      <div
        className="mb-4 pb-3"
        style={{ borderBottom: "1px solid var(--rule-soft)" }}
      >
        <SegmentFilter activeSegment={activeSegment} activeWindow={activeWindow} />
      </div>

      {/* ── Main content row ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col lg:flex-row lg:gap-0">
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
                    scroll={false}
                    className="rounded-full px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-1"
                    style={{
                      border: "1px solid var(--rule-soft)",
                      background: isActive ? "var(--accent)" : "transparent",
                      color: isActive ? "var(--on-accent)" : "var(--ink-mute)",
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

        {/* Radar SVG — wrapped in RadarBgContainer for the light/dark bg toggle */}
        <RadarBgContainer>
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
            <RadarChartClient allTechs={allTechs} selectedCats={selectedCats} />
          )}
        </RadarBgContainer>
      </div>

      {/* ── Side rail ───────────────────────────────────────────────── */}
      <div
        className="mt-4 flex flex-col gap-4 lg:ml-5 lg:mt-0 lg:w-72"
        style={{ flexShrink: 0 }}
      >
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
      </div>{/* ── end main content row ── */}
    </main>
  );
}

