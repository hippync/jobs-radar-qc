"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORY_LABELS,
  type CatSlug,
  type TechRow,
  catToCssSlug,
} from "@/lib/radarHelpers";

const CX = 280, CY = 240, R = 200;
const RINGS = [0.95, 0.68, 0.42, 0.18];

interface TooltipState {
  name: string;
  count: number;
  category: string;
  /** SVG viewBox coordinates — converted to % for CSS positioning */
  vx: number;
  vy: number;
}

export function RadarChartClient({
  allTechs,
  selectedCats,
}: {
  allTechs: TechRow[];
  selectedCats: string[];
}) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [focusedBubble, setFocusedBubble] = useState<string | null>(null);
  const router = useRouter();

  /* ── Group techs by sector, capped at 8 per sector ──────────────────── */
  const byCat: Record<string, TechRow[]> = {};
  for (const cat of selectedCats) byCat[cat] = [];
  for (const t of allTechs) {
    const arr = byCat[t.category];
    if (arr && arr.length < 8) arr.push(t);
  }

  const CATEGORY_LEADERS = new Set(
    selectedCats.flatMap((cat) => {
      const leader = byCat[cat]?.[0];
      return leader ? [leader.name] : [];
    }),
  );

  interface PlacedTech {
    tech: TechRow;
    x: number;
    y: number;
    size: number;
    isCategoryLeader: boolean;
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
      const rankFrac = tech.rank / Math.max(1, allTechs.length);
      const r = R * (0.16 + 0.76 * Math.min(1, rankFrac * 1.8));
      const x = CX + Math.cos(angle) * r;
      const y = CY + Math.sin(angle) * r;
      const size = Math.max(6, Math.min(20, Math.sqrt(tech.count) * 1.3));
      const isCategoryLeader = CATEGORY_LEADERS.has(tech.name);
      const labelSide = x > CX ? "right" : "left";
      placed.push({ tech, x, y, size, isCategoryLeader, labelSide });
    });
  });

  const visibleCount = placed.length;

  function navigate(techName: string) {
    router.push(`/?tech=${encodeURIComponent(techName)}`);
  }

  function showTooltip(tech: TechRow, x: number, y: number) {
    const catLabel = CATEGORY_LABELS[tech.category as CatSlug] ?? tech.category;
    setTooltip({ name: tech.name, count: tech.count, category: catLabel, vx: x, vy: y });
  }

  function hideTooltip() {
    setTooltip(null);
  }

  // Position tooltip above the bubble by default; flip below if near the top.
  const nearTop = tooltip !== null && tooltip.vy < 60;
  const tooltipTransform = nearTop
    ? "translate(-50%, 12px)"
    : "translate(-50%, calc(-100% - 10px))";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
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
          <circle
            key={i}
            cx={CX}
            cy={CY}
            r={R * k}
            fill="none"
            stroke="var(--rule-soft)"
            strokeDasharray="3 5"
            strokeWidth="1"
          />
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

        {/* Sector labels */}
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

        {/* Pass 1 — circles only (hit targets, focus rings, visible bubbles).
            Labels are rendered in pass 2 so they always sit above all circles. */}
        {placed.map(({ tech, x, y, size, isCategoryLeader }) => {
          const cssSlug = catToCssSlug(tech.category);
          const catColor = `var(--cat-${cssSlug}, var(--accent))`;
          const bubbleFill = isCategoryLeader
            ? catColor
            : `color-mix(in oklab, ${catColor} 35%, var(--surface))`;
          const catLabel = CATEGORY_LABELS[tech.category as CatSlug] ?? tech.category;
          const ariaLabel = `${tech.name} — ${tech.count} roles, ${catLabel}`;
          const isFocused = focusedBubble === tech.name;

          return (
            <g
              key={tech.name}
              role="button"
              tabIndex={0}
              aria-label={ariaLabel}
              style={{ cursor: "pointer", outline: "none" }}
              onClick={() => navigate(tech.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(tech.name);
                }
              }}
              onMouseEnter={() => showTooltip(tech, x, y)}
              onMouseLeave={hideTooltip}
              onFocus={() => {
                setFocusedBubble(tech.name);
                showTooltip(tech, x, y);
              }}
              onBlur={() => {
                setFocusedBubble(null);
                hideTooltip();
              }}
            >
              {/* Expanded transparent hit target for small bubbles / touch */}
              <circle
                cx={x}
                cy={y}
                r={Math.max(size + 6, 18)}
                fill="transparent"
                aria-hidden
              />
              {/* Accent focus ring — shown on keyboard focus */}
              {isFocused && (
                <circle
                  cx={x}
                  cy={y}
                  r={size + 4}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  aria-hidden
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={size}
                fill={bubbleFill}
                stroke="var(--rule-soft)"
                strokeWidth="1"
              />
            </g>
          );
        })}

        {/* Pass 2 — category leader labels rendered after all circles so they're
            never obscured by a bubble from an adjacent sector. */}
        {placed.filter(p => p.isCategoryLeader).map(({ tech, x, y, size, labelSide }) => {
          const lx = labelSide === "right" ? x + size + 4 : x - size - 4;
          const anchor = labelSide === "right" ? "start" : "end";
          return (
            <g key={`lbl-${tech.name}`} aria-hidden style={{ pointerEvents: "none" }}>
              <text
                x={lx}
                y={y + 4}
                fontFamily="var(--font-sans)"
                fontSize="10.5"
                fontWeight="600"
                textAnchor={anchor}
                fill="var(--ink)"
              >
                {tech.name}
              </text>
              <text
                x={lx}
                y={y + 15}
                fontFamily="var(--font-mono)"
                fontSize="8.5"
                textAnchor={anchor}
                fill="var(--ink-mute)"
              >
                {tech.count}
              </text>
            </g>
          );
        })}

        {/* How to read — full-width strip below the radar circle (y > 440) */}
        <g aria-hidden style={{ pointerEvents: "none" }}>
          <rect
            x="8"
            y="443"
            width="544"
            height="28"
            rx="3"
            fill="var(--surface)"
            fillOpacity="0.88"
            stroke="var(--rule-soft)"
            strokeWidth="1"
          />
          <text x="16" y="461" fontFamily="var(--font-sans)" fontSize="9" fill="var(--ink-mute)">
            ● Bigger bubble = more jobs
          </text>
          <text x="280" y="461" fontFamily="var(--font-sans)" fontSize="9" fill="var(--ink-mute)" textAnchor="middle">
            ◎ Closer to center = stronger demand
          </text>
          <text x="544" y="461" fontFamily="var(--font-sans)" fontSize="9" fill="var(--ink-mute)" textAnchor="end">
            → Click to filter roles
          </text>
        </g>
      </svg>

      {/* HTML tooltip overlay — positioned in % coords over the SVG viewBox.
          Fully inline styles so the tooltip works regardless of CSS build order. */}
      {tooltip && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            left: `${((tooltip.vx / 560) * 100).toFixed(1)}%`,
            top: `${((tooltip.vy / 480) * 100).toFixed(1)}%`,
            transform: tooltipTransform,
            pointerEvents: "none",
            zIndex: 20,
            background: "var(--surface)",
            border: "1px solid var(--rule-soft)",
            borderRadius: 6,
            padding: "4px 8px",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
          }}
        >
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--ink)",
              lineHeight: 1.4,
            }}
          >
            {tooltip.name}
          </span>
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ink-mute)",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.4,
            }}
          >
            {tooltip.count} roles · {tooltip.category}
          </span>
        </div>
      )}
    </div>
  );
}
