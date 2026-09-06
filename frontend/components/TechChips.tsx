"use client";

import { useState } from "react";

const CHIP_STYLE = {
  background: "var(--bg-2)",
  color: "var(--ink-soft)",
  border: "1px solid var(--rule-soft)",
  fontSize: 11,
};

/**
 * Tech-stack chip row with an expandable "+N" (issue #139) — previously a
 * static, non-interactive label. `techs` should already be ordered with the
 * most distinctive tags first (see sortByDistinctiveness in JobCard.tsx) so
 * both the collapsed row and the "+N" hover preview lead with the most
 * useful information.
 */
export default function TechChips({ techs, max }: { techs: string[]; max: number }) {
  const [expanded, setExpanded] = useState(false);

  if (techs.length === 0) return null;

  const hiddenCount = techs.length - max;
  const visible = expanded ? techs : techs.slice(0, max);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((t) => (
        <span
          key={t}
          className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
          style={CHIP_STYLE}
        >
          {t}
        </span>
      ))}
      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title={techs.slice(max).join(", ")}
          aria-label={`Show ${hiddenCount} more technologies: ${techs.slice(max).join(", ")}`}
          className="inline-flex items-center rounded px-1.5 py-0.5 text-xs transition-colors"
          style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer" }}
        >
          +{hiddenCount}
        </button>
      )}
      {expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="Show fewer technologies"
          className="inline-flex items-center rounded px-1.5 py-0.5 text-xs transition-colors"
          style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer" }}
        >
          Show less
        </button>
      )}
    </div>
  );
}
