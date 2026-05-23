"use client";

import SourceBadge from "./SourceBadge";

/* ── Shared types (re-exported so SavedPageClient + SaveButton can import) */
export type Column = "watching" | "applied" | "interviewing" | "archived";

export interface SavedJob {
  id: string;
  company: string;
  title: string;
  source: string;
  source_url: string;
  location: string | null;
  first_seen_at: string;
  tech_stack: string[];
  column: Column;
  savedAt: number;
}

/* ── Age helper ────────────────────────────────────────────────────────── */
function ageText(iso: string | null): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  return `${diff}d`;
}

/* ── KanbanCard ─────────────────────────────────────────────────────────
 *
 * Redesigned per issue #39 / ux-ui_agent.md:
 *  - Company name mono uppercase + full SourceBadge (GH·GREENHOUSE etc.)
 *  - Title 2-line max with title= attribute for ellipsis tooltip
 *  - Placeholder slot for FitScoreRing (renders nothing until #24)
 *  - Age dot (mono 9px) + "open ↗" ATS link + accessible × remove button
 *  - border-left: 3px solid var(--accent) on every card (Linear-style stripe)
 *  - No <select> "Move to…" — column moves will be drag (#33) + ··· menu
 *  - No hardcoded hex — all colors via CSS custom properties
 */
export function KanbanCard({
  job,
  onRemove,
}: {
  job: SavedJob;
  onRemove: (id: string) => void;
}) {
  const age = ageText(job.first_seen_at);

  return (
    <article
      className="flex flex-col gap-2 p-3"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--rule-soft)",
        /* 3-px left accent stripe — brand rule from ux-ui_agent.md §2 */
        borderLeft: "3px solid var(--accent)",
        borderRadius: 6,
      }}
    >
      {/* ── Row 1: Company mono + Source badge ── */}
      <div className="flex items-center gap-2">
        <span
          className="flex-1 truncate font-semibold uppercase tracking-wide"
          style={{
            color: "var(--ink-mute)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.05em",
          }}
        >
          {job.company}
        </span>
        <SourceBadge source={job.source} />
      </div>

      {/* ── Row 2: Job title, 2-line max ── */}
      <p
        className="line-clamp-2 font-semibold leading-snug"
        style={{ color: "var(--ink)", fontSize: 12.5, margin: 0 }}
        title={job.title}
      >
        {job.title}
      </p>

      {/*
       * ── FitScoreRing placeholder ──
       * Renders nothing until issue #24 ships.
       * When #24 lands, swap this comment for:
       *   {job.fitScore !== undefined && <FitScoreRing pct={job.fitScore} size={22} />}
       */}

      {/* ── Row 3: Age · open ↗ · × remove ── */}
      <div className="flex items-center gap-2">
        {/* Age dot */}
        {age ? (
          <span
            className="flex-1 tabular"
            style={{
              color: "var(--ink-mute)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
            }}
          >
            {age}
          </span>
        ) : (
          <span className="flex-1" aria-hidden />
        )}

        {/* "open ↗" link — Lucide arrow-up-right approximation */}
        <a
          href={job.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-0.5"
          style={{
            color: "var(--ink-mute)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            transition: "color 120ms ease-out",
            textDecoration: "none",
          }}
          aria-label={`Open "${job.title}" on ${job.source}`}
        >
          open
          <svg
            width="9"
            height="9"
            viewBox="0 0 9 9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden
            focusable="false"
          >
            <path d="M1.5 7.5L7.5 1.5M3.5 1.5h4v4" />
          </svg>
        </a>

        {/*
         * × remove button.
         * Touch target: 44 × 44 px via explicit width/height + negative
         * margins so the surrounding flex row isn't visually inflated.
         * Same technique used in SaveButton.tsx.
         */}
        <button
          type="button"
          onClick={() => onRemove(job.id)}
          className="flex shrink-0 items-center justify-center"
          style={{
            width: 44,
            height: 44,
            marginTop: -10,
            marginBottom: -10,
            marginRight: -10,
            color: "var(--ink-mute)",
            background: "none",
            border: "none",
            cursor: "pointer",
            borderRadius: 4,
            transition: "color 120ms ease-out",
          }}
          aria-label={`Remove "${job.title}" from saved`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden
            focusable="false"
          >
            <path d="M2 2l8 8M10 2L2 10" />
          </svg>
        </button>
      </div>
    </article>
  );
}
