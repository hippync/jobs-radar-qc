"use client";

import SourceBadge from "./SourceBadge";

/* ── Shared types (re-exported so SavedPageClient + SaveButton can import) */
export type Column = "watching" | "applied" | "interviewing" | "archived";

/** Ordered list of columns — used by ← → move buttons to compute prev/next. */
export const COLUMN_ORDER: Column[] = [
  "watching",
  "applied",
  "interviewing",
  "archived",
];

/** Human-readable label for each column. */
export const COLUMN_LABELS: Record<Column, string> = {
  watching:     "Watching",
  applied:      "Applied",
  interviewing: "Interviewing",
  archived:     "Archived",
};

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
 *  - Company name mono uppercase + full SourceBadge
 *  - Title 2-line max with title= attribute for ellipsis tooltip
 *  - Age dot (mono 9px) + "open ↗" ATS link + accessible × remove button
 *  - border-left: 3px solid var(--accent) on every card (Linear-style stripe)
 *  - No hardcoded hex — all colors via CSS custom properties
 *
 * Drag-and-drop added per issue #33:
 *  - draggable="true" + onDragStart / onDragEnd handlers
 *  - isDragging prop fades card to 50% opacity while airborne (ghost stays full)
 *  - aria-grabbed attribute (deprecated in ARIA 1.2 but still broadly supported)
 *  - ← → arrow buttons as keyboard/touch fallback (no select per ux-ui_agent.md §7)
 */
export function KanbanCard({
  job,
  onRemove,
  onMove,
  onDragStart,
  onDragEnd,
  isDragging = false,
}: {
  job: SavedJob;
  onRemove: (id: string) => void;
  /** Move the card to a different column (keyboard ← → buttons + drop handler). */
  onMove: (id: string, col: Column) => void;
  /** Notify the board that this card started being dragged. */
  onDragStart: (id: string) => void;
  /** Notify the board that this card's drag ended (drop or cancel). */
  onDragEnd: () => void;
  /** Whether this card is currently the one being dragged. */
  isDragging?: boolean;
}) {
  const age = ageText(job.first_seen_at);

  /* ── Keyboard ← → helpers ── */
  const colIdx = COLUMN_ORDER.indexOf(job.column);
  const prevCol = colIdx > 0 ? COLUMN_ORDER[colIdx - 1] : null;
  const nextCol = colIdx < COLUMN_ORDER.length - 1 ? COLUMN_ORDER[colIdx + 1] : null;
  const prevLabel = prevCol ? COLUMN_LABELS[prevCol] : null;
  const nextLabel = nextCol ? COLUMN_LABELS[nextCol] : null;

  return (
    <article
      className="flex flex-col gap-2 p-3"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", job.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(job.id);
      }}
      onDragEnd={onDragEnd}
      /*
       * aria-grabbed: true while dragging, false when not dragging but draggable.
       * Deprecated in ARIA 1.2 but retained here for backward compatibility
       * with screen readers that still expose it (NVDA, JAWS).
       */
      aria-grabbed={isDragging}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--rule-soft)",
        /* 3-px left accent stripe — brand rule from ux-ui_agent.md §2 */
        borderLeft: "3px solid var(--accent)",
        borderRadius: 6,
        /* Fade the source card while airborne; the drag ghost stays at full opacity. */
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? "grabbing" : "grab",
        transition: "opacity 120ms ease-out",
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

      {/* ── Row 3: Age · move buttons · open ↗ · × remove ── */}
      <div className="flex items-center gap-1">
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

        {/*
         * ← Move to previous column
         * Keyboard / touch fallback for drag-and-drop (issue #33).
         * Visually: small chevron-left icon. Hit target: 28×28 px
         * (acceptable since it supplements drag — primary control is drag/touch).
         * Disabled and visually muted when card is in the first column.
         */}
        <button
          type="button"
          onClick={() => prevCol && onMove(job.id, prevCol)}
          disabled={!prevCol}
          className="flex shrink-0 items-center justify-center"
          style={{
            width: 28,
            height: 28,
            color: prevCol ? "var(--ink-mute)" : "var(--rule-soft)",
            background: "none",
            border: "none",
            cursor: prevCol ? "pointer" : "default",
            borderRadius: 4,
            transition: "color 120ms ease-out",
            padding: 0,
          }}
          aria-label={
            prevLabel
              ? `Move "${job.title}" to ${prevLabel}`
              : "Already in first column"
          }
        >
          {/* Lucide chevron-left, 12×12, stroke 1.5 */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            focusable="false"
          >
            <path d="M7.5 2L3.5 6L7.5 10" />
          </svg>
        </button>

        {/*
         * → Move to next column
         */}
        <button
          type="button"
          onClick={() => nextCol && onMove(job.id, nextCol)}
          disabled={!nextCol}
          className="flex shrink-0 items-center justify-center"
          style={{
            width: 28,
            height: 28,
            color: nextCol ? "var(--ink-mute)" : "var(--rule-soft)",
            background: "none",
            border: "none",
            cursor: nextCol ? "pointer" : "default",
            borderRadius: 4,
            transition: "color 120ms ease-out",
            padding: 0,
          }}
          aria-label={
            nextLabel
              ? `Move "${job.title}" to ${nextLabel}`
              : "Already in last column"
          }
        >
          {/* Lucide chevron-right, 12×12, stroke 1.5 */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            focusable="false"
          >
            <path d="M4.5 2L8.5 6L4.5 10" />
          </svg>
        </button>

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
