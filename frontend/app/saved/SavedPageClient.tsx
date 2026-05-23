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
   * move() is intentionally defined here and not yet wired to any UI.
   * It will be called by the drag-and-drop handler (#33) and the ··· column
   * menu once those features land.
   */
  function move(id: string, col: Column) {
    setSaved((prev) => {
      const next = prev.map((j) => (j.id === id ? { ...j, column: col } : j));
      persistSaved(next);
      return next;
    });
  }
  // Suppress unused-variable warning until #33 wires up drag-and-drop.
  void move;

  function remove(id: string) {
    setSaved((prev) => {
      const next = prev.filter((j) => j.id !== id);
      persistSaved(next);
      return next;
    });
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
            Drag cards between columns. Stored locally — never sent to a server.
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
                   * ··· column-actions button — placeholder for future menu (#33).
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
                 * ── Column body ──
                 *
                 * dashed border on the lane, bg-2 tint behind the cards.
                 * Empty state: centered "No jobs in [Column] yet" text.
                 */}
                <div
                  style={{
                    background: "var(--bg-2)",
                    borderRadius: 6,
                    border: "1.5px dashed var(--rule-soft)",
                    padding: 8,
                    minHeight: 200,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
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
                          color: "var(--ink-mute)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        No jobs in {col.label} yet
                      </p>
                    </div>
                  ) : (
                    jobs.map((job) => (
                      <KanbanCard
                        key={job.id}
                        job={job}
                        onRemove={remove}
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
