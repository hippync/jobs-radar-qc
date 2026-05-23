"use client";

import { useState } from "react";
import Link from "next/link";
import { KanbanCard } from "@/components/KanbanCard";
import type { SavedJob, Column } from "@/components/KanbanCard";

/* ── localStorage helpers ───────────────────────────────────────────── */
const STORAGE_KEY = "jobs-radar-qc:saved";

function loadSaved(): SavedJob[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSaved(jobs: SavedJob[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {}
}

/* ── Column config ──────────────────────────────────────────────────────
 *
 * Colors reference CSS custom properties — no hardcoded hex.
 * --col-applied is defined in globals.css.
 * Interviewing reuses --gh-fg (same value; both are trust-signal green).
 */
const COLUMNS: Array<{ key: Column; label: string; color: string }> = [
  { key: "watching",     label: "Watching",     color: "var(--accent)" },
  { key: "applied",      label: "Applied",       color: "var(--col-applied)" },
  { key: "interviewing", label: "Interviewing",  color: "var(--gh-fg)" },
  { key: "archived",     label: "Archived",      color: "var(--ink-mute)" },
];

/* ── Empty board state ──────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-full"
        style={{ background: "var(--bg-2)", border: "1px solid var(--rule-soft)" }}
      >
        {/* Lucide star */}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          style={{ color: "var(--ink-mute)" }}
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </div>
      <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
        No saved jobs yet
      </p>
      <p className="mt-1 max-w-xs text-sm" style={{ color: "var(--ink-mute)" }}>
        Browse jobs and use the star on any listing to track it here.
      </p>
      <Link
        href="/"
        className="mt-5 rounded-md px-4 py-2.5 text-sm font-semibold"
        style={{
          background: "var(--accent)",
          color: "var(--surface)",
          transition: "opacity 120ms ease-out",
        }}
      >
        Browse jobs
      </Link>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */

// Loaded with ssr:false (via SavedWrapper) so window/localStorage are always available.
export default function SavedPageClient() {
  const [saved, setSaved] = useState<SavedJob[]>(() => loadSaved());

  /*
   * Drag state:
   *  - draggingId  — id of the card currently being dragged (null when idle)
   *  - dragOverCol — which column the cursor is over during an active drag
   *
   * Visual feedback rule (issue #33): when draggingId is set and dragOverCol
   * matches a column, that column's body switches to --accent-12 bg + accent
   * dashed border.
   */
  const [draggingId, setDraggingId]   = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<Column | null>(null);

  /* ── move: update column + persist ── */
  function move(id: string, col: Column) {
    setSaved((prev) => {
      const next = prev.map((j) => (j.id === id ? { ...j, column: col } : j));
      persistSaved(next);
      return next;
    });
  }

  function remove(id: string) {
    setSaved((prev) => {
      const next = prev.filter((j) => j.id !== id);
      persistSaved(next);
      return next;
    });
  }

  /* ── Drag event handlers ── */

  function handleDragStart(id: string) {
    setDraggingId(id);
  }

  /*
   * onDragEnd fires on the source card when a drag ends — whether it was
   * dropped on a valid target, an invalid target, or cancelled.
   * Always clears both drag state fields.
   */
  function handleDragEnd() {
    setDraggingId(null);
    setDragOverCol(null);
  }

  /*
   * onDragEnter fires when the cursor enters a column drop zone.
   * We set dragOverCol here (rather than onDragOver) to avoid the firing
   * rate of onDragOver causing excessive re-renders.
   */
  function handleDragEnter(e: React.DragEvent, col: Column) {
    e.preventDefault();
    if (dragOverCol !== col) setDragOverCol(col);
  }

  /*
   * onDragOver must call preventDefault() to signal this is a valid drop
   * target; without it the browser shows the "forbidden" cursor and onDrop
   * won't fire.
   */
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  /*
   * onDragLeave fires when the cursor leaves a column's drop zone.
   * We use currentTarget.contains(relatedTarget) to avoid clearing the
   * highlight when the cursor merely moves over a child element (e.g. a
   * KanbanCard inside the column). Only clears when truly leaving the column.
   */
  function handleDragLeave(e: React.DragEvent, col: Column) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (dragOverCol === col) setDragOverCol(null);
    }
  }

  /*
   * onDrop — the actual drop handler.
   * Reads the card id from dataTransfer, calls move(), and resets drag state.
   * Dropping outside any column (no valid onDragOver target) never reaches
   * this handler, so the card stays unchanged.
   */
  function handleDrop(e: React.DragEvent, col: Column) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) move(id, col);
    setDraggingId(null);
    setDragOverCol(null);
  }

  const isEmpty = saved.length === 0;
  const colCounts = Object.fromEntries(
    COLUMNS.map((c) => [c.key, saved.filter((j) => j.column === c.key).length])
  ) as Record<Column, number>;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">

      {/* ── Page header ── */}
      <div className="mb-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
            Tracker
          </h1>
          <p className="text-sm" style={{ color: "var(--ink-mute)" }}>
            Drag cards between columns or use the ← → buttons. Stored locally.
          </p>
        </div>
        {!isEmpty && (
          <p
            className="mt-1 tabular"
            style={{
              color: "var(--ink-mute)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
          >
            {saved.length} saved
          </p>
        )}
      </div>

      {isEmpty ? (
        <EmptyState />
      ) : (
        /*
         * ── Kanban board ──────────────────────────────────────────────────
         *
         * Desktop (≥ 768px): CSS grid with 4 equal columns.
         * Mobile (< 768px):  horizontal flex with scroll-snap — each column
         *   fills ~full-viewport width and snaps on swipe.
         *
         * Native HTML5 drag-and-drop is unreliable on iOS Safari; the ← →
         * arrow buttons on each card serve as the primary mobile fallback.
         * Cross-column reordering is supported; within-column reordering is
         * not implemented (cards maintain insertion order within a column).
         *
         * Both layouts defined in globals.css (.kanban-board / .kanban-column).
         */
        <div
          className="kanban-board"
          role="list"
          aria-label="Job tracker board"
        >
          {COLUMNS.map((col) => {
            const jobs = saved.filter((j) => j.column === col.key);
            const count = colCounts[col.key];
            /*
             * isDropTarget: true only when a drag is active AND the cursor
             * is currently over this specific column.
             */
            const isDropTarget = draggingId !== null && dragOverCol === col.key;

            return (
              <section
                key={col.key}
                className="kanban-column"
                role="listitem"
                aria-label={`${col.label} — ${count} job${count !== 1 ? "s" : ""}`}
              >
                {/* ── Column header ── */}
                <div
                  className="mb-2 flex items-center gap-2"
                  style={{ minHeight: 32 }}
                >
                  {/* Status dot */}
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: col.color,
                      flexShrink: 0,
                    }}
                  />

                  {/* Column label */}
                  <span
                    className="font-semibold"
                    style={{ color: "var(--ink)", fontSize: 12 }}
                  >
                    {col.label}
                  </span>

                  {/* Job count */}
                  <span
                    className="tabular"
                    style={{
                      color: "var(--ink-mute)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                    }}
                    aria-hidden /* already in the section aria-label */
                  >
                    {count}
                  </span>

                  <span className="flex-1" />

                  {/*
                   * ··· column-actions button — placeholder for future menu.
                   * 44 × 44 px touch target per ux-ui_agent.md §5.
                   */}
                  <button
                    type="button"
                    className="flex items-center justify-center"
                    style={{
                      width: 44,
                      height: 44,
                      marginTop: -8,
                      marginBottom: -8,
                      marginRight: -10,
                      color: "var(--ink-mute)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "var(--font-mono)",
                      fontSize: 13,
                      letterSpacing: "0.06em",
                      borderRadius: 4,
                      transition: "color 120ms ease-out",
                    }}
                    aria-label={`Column actions for ${col.label}`}
                    aria-haspopup="menu"
                  >
                    ···
                  </button>
                </div>

                {/*
                 * ── Column body (drop zone) ──────────────────────────────
                 *
                 * - onDragEnter / onDragOver / onDragLeave / onDrop wired here.
                 * - aria-dropeffect="move" signals to AT that a drop will move
                 *   the dragged item (deprecated but still read by JAWS/NVDA).
                 * - Visual feedback: isDropTarget toggles --accent-12 bg +
                 *   solid accent border. Transition disabled by
                 *   prefers-reduced-motion via globals.css.
                 *
                 * Empty columns are valid drop targets (minHeight: 200 ensures
                 * they remain large enough to hit).
                 */}
                <div
                  onDragEnter={(e) => handleDragEnter(e, col.key)}
                  onDragOver={handleDragOver}
                  onDragLeave={(e) => handleDragLeave(e, col.key)}
                  onDrop={(e) => handleDrop(e, col.key)}
                  /* aria-dropeffect is deprecated in ARIA 1.2 but retained for AT compatibility */
                  aria-dropeffect={draggingId ? "move" : undefined}
                  style={{
                    background: isDropTarget ? "var(--accent-12)" : "var(--bg-2)",
                    borderRadius: 6,
                    border: isDropTarget
                      ? "1.5px dashed var(--accent)"
                      : "1.5px dashed var(--rule-soft)",
                    padding: 8,
                    minHeight: 200,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    transition: "background 120ms ease-out, border-color 120ms ease-out",
                  }}
                  role="region"
                  aria-label={`${col.label} job cards`}
                >
                  {jobs.length === 0 ? (
                    <div
                      className="flex flex-1 items-center justify-center py-10"
                      aria-live="polite"
                    >
                      <p
                        className="text-center text-xs"
                        style={{
                          color: isDropTarget ? "var(--accent)" : "var(--ink-mute)",
                          fontFamily: "var(--font-mono)",
                          transition: "color 120ms ease-out",
                        }}
                      >
                        {isDropTarget ? "Drop here" : `No jobs in ${col.label} yet`}
                      </p>
                    </div>
                  ) : (
                    jobs.map((job) => (
                      <KanbanCard
                        key={job.id}
                        job={job}
                        onRemove={remove}
                        onMove={move}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        isDragging={draggingId === job.id}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
