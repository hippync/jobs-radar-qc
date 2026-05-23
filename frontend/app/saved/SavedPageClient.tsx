"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { KanbanCard } from "@/components/KanbanCard";
import type { SavedJob, Column } from "@/components/KanbanCard";

/* ── Storage keys ─────────────────────────────────────────────────────── */
const STORAGE_KEY = "jobs-radar-qc:saved";
const VIEW_KEY    = "jobs-radar-qc:tracker-view";

/*
 * Custom DOM events used to notify useSyncExternalStore subscribers when
 * localStorage / sessionStorage changes within the same tab.
 * (The native "storage" event only fires for changes from other tabs.)
 */
const SAVED_CHANGE = "jobs-radar-qc:saved-change";
const VIEW_CHANGE  = "jobs-radar-qc:view-change";

/* ── localStorage helpers ─────────────────────────────────────────────── */
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
    window.dispatchEvent(new Event(SAVED_CHANGE));
  } catch {}
}

/* ── sessionStorage helpers ───────────────────────────────────────────────
 *
 * View state (board | list) is stored in sessionStorage so it survives
 * a page refresh but resets when the browser tab is closed — per spec.
 */
function loadView(): "board" | "list" {
  try {
    return sessionStorage.getItem(VIEW_KEY) === "list" ? "list" : "board";
  } catch {
    return "board";
  }
}

function persistView(v: "board" | "list") {
  try {
    sessionStorage.setItem(VIEW_KEY, v);
    window.dispatchEvent(new Event(VIEW_CHANGE));
  } catch {}
}

/* ── useSyncExternalStore subscriber functions ────────────────────────── */
function subscribeSaved(cb: () => void): () => void {
  window.addEventListener(SAVED_CHANGE, cb);
  return () => window.removeEventListener(SAVED_CHANGE, cb);
}

function subscribeView(cb: () => void): () => void {
  window.addEventListener(VIEW_CHANGE, cb);
  return () => window.removeEventListener(VIEW_CHANGE, cb);
}

/* ── Age helper ───────────────────────────────────────────────────────────
 * Converts a Unix-ms timestamp to "today", "yesterday", or "Nd".
 */
function ageFromTs(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 86_400_000);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  return `${diff}d`;
}

/* ── Column config ────────────────────────────────────────────────────── */
const COLUMNS: Array<{ key: Column; label: string; color: string }> = [
  { key: "watching",     label: "Watching",     color: "var(--accent)" },
  { key: "applied",      label: "Applied",       color: "var(--col-applied)" },
  { key: "interviewing", label: "Interviewing",  color: "var(--gh-fg)" },
  { key: "archived",     label: "Archived",      color: "var(--ink-mute)" },
];

/* ── Empty state ──────────────────────────────────────────────────────── */
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

/* ── List-view row ────────────────────────────────────────────────────────
 *
 * Simplified horizontal row used when the "List" toggle is active.
 * Shows all saved jobs across all columns, sorted by savedAt desc.
 * No move buttons — users switch to Board view for drag-and-drop.
 */
function SavedListRow({
  job,
  onRemove,
}: {
  job: SavedJob;
  onRemove: (id: string) => void;
}) {
  const colCfg = COLUMNS.find((c) => c.key === job.column);
  const age    = ageFromTs(job.savedAt);

  return (
    <article
      role="listitem"
      className="flex items-center gap-3 px-3"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--rule-soft)",
        borderLeft: "3px solid var(--accent)",
        borderRadius: 6,
        minHeight: 48,
      }}
    >
      {/* Title + company */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="truncate font-semibold leading-snug"
          style={{ fontSize: 12.5, color: "var(--ink)" }}
          title={job.title}
        >
          {job.title}
        </span>
        <span
          className="truncate uppercase"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--ink-mute)",
            letterSpacing: "0.05em",
          }}
        >
          {job.company}
        </span>
      </div>

      {/* Column badge */}
      {colCfg && (
        <span
          className="shrink-0"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: colCfg.color,
            background: "var(--bg-2)",
            border: "1px solid var(--rule-soft)",
            borderRadius: 999,
            padding: "1px 6px",
            whiteSpace: "nowrap",
          }}
        >
          {colCfg.label}
        </span>
      )}

      {/* Age (savedAt) */}
      <span
        className="tabular shrink-0"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--ink-mute)",
        }}
      >
        {age}
      </span>

      {/* Open ↗ link */}
      <a
        href={job.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex shrink-0 items-center gap-0.5"
        style={{
          color: "var(--ink-mute)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          textDecoration: "none",
          transition: "color 120ms ease-out",
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
       * × Remove button.
       * 44 × 44 px touch target via explicit dimensions + negative
       * margins so the surrounding flex row is not visually inflated.
       */}
      <button
        type="button"
        onClick={() => onRemove(job.id)}
        className="flex shrink-0 items-center justify-center"
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
    </article>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function SavedPageClient() {
  /*
   * useSyncExternalStore — the correct React 18 pattern for reading
   * browser-only external stores (localStorage / sessionStorage) without
   * causing a hydration mismatch (error #418).
   *
   * React calls getServerSnapshot() during SSR to produce the initial HTML,
   * and getSnapshot() on the client. When they differ React re-renders the
   * client tree from the client snapshot without throwing a hydration error.
   * Writes go directly to storage (persistSaved / persistView) and then
   * dispatch a custom DOM event; that triggers the subscriber callback,
   * which causes React to re-read getSnapshot() and re-render.
   *
   * No useEffect, no mounted flag, no setState-in-effect lint violation.
   */
  const saved = useSyncExternalStore(
    subscribeSaved,
    loadSaved,          /* client snapshot  */
    (): SavedJob[] => [], /* server snapshot */
  );

  /*
   * View toggle state: "board" (4-column Kanban) or "list" (vertical list).
   * Persisted in sessionStorage — survives refresh, resets on tab close.
   */
  const view = useSyncExternalStore(
    subscribeView,
    loadView,                            /* client snapshot */
    (): "board" | "list" => "board",     /* server snapshot */
  );

  /*
   * Drag state:
   *  - draggingId  — id of the card currently being dragged (null when idle)
   *  - dragOverCol — which column the cursor is over during an active drag
   */
  const [draggingId, setDraggingId]   = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<Column | null>(null);

  /* ── Move + remove ──
   * Write directly to storage; persistSaved/persistView dispatch a custom
   * DOM event that notifies the useSyncExternalStore subscriber, which
   * causes React to re-read loadSaved()/loadView() and re-render.
   */
  function move(id: string, col: Column) {
    const next = saved.map((j) => (j.id === id ? { ...j, column: col } : j));
    persistSaved(next);
  }

  function remove(id: string) {
    persistSaved(saved.filter((j) => j.id !== id));
  }

  /* ── View toggle ── */
  function handleViewChange(v: "board" | "list") {
    persistView(v);
  }

  /* ── Drag handlers ── */
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
   * onDrop — reads the card id from dataTransfer, calls move(), resets state.
   */
  function handleDrop(e: React.DragEvent, col: Column) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) move(id, col);
    setDraggingId(null);
    setDragOverCol(null);
  }

  /* ── Derived / computed ── */
  const isEmpty    = saved.length === 0;
  const colCounts  = Object.fromEntries(
    COLUMNS.map((c) => [c.key, saved.filter((j) => j.column === c.key).length])
  ) as Record<Column, number>;

  /*
   * Stats — computed synchronously from `saved` state, no useEffect.
   *
   * activeAlerts: placeholder 0 until issue #25 (AlertRuleEditor) ships.
   * lastMatchText: most recent savedAt timestamp → "today", "yesterday", "Nd".
   */
  const activeAlerts: number = 0; /* placeholder: #25 not shipped */
  const latestSavedAt  = saved.length
    ? Math.max(...saved.map((j) => j.savedAt))
    : null;
  const lastMatchText  = latestSavedAt ? ageFromTs(latestSavedAt) : null;

  /* List-view data: all saved jobs sorted by savedAt desc. */
  const listJobs = [...saved].sort((a, b) => b.savedAt - a.savedAt);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">

      {/* ── Rich header (issue #40) ──────────────────────────────────────
       *
       * Always rendered — even in empty state — so stats reflect
       * localStorage at 0 saved / 0 alerts.
       *
       * Responsive: on < 640 px, controls (toggle + add-alert button)
       * wrap to a second line below the title.
       */}
      <header className="mb-5">
        {/* Row 1: title · subtitle  +  controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

          {/* Left: title + subtitle */}
          <div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: "var(--ink)",
                margin: 0,
                lineHeight: 1.25,
              }}
            >
              Tracker
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-mute)",
                margin: "3px 0 0",
              }}
            >
              Drag cards between columns. Stored locally — never sent to a server.
            </p>
          </div>

          {/* Right: view toggle + add alert */}
          <div className="flex items-center gap-2">

            {/*
             * Board / List toggle pills.
             *
             * Rendered as a group of two adjacent buttons:
             *   active  = var(--bg-2) background + var(--rule) border
             *   inactive = transparent background + transparent border
             *             (transparent border preserves layout so no jump on switch)
             *
             * aria-pressed on each button communicates the active state to
             * screen readers; the group role="group" labels the pair.
             */}
            <div role="group" aria-label="View toggle" className="flex">
              {/*
               * Use longhand border-* properties only — mixing the `border`
               * shorthand with `borderRight` / `borderLeft` triggers a React
               * style-conflict warning on rerender.
               */}
              <button
                type="button"
                onClick={() => handleViewChange("board")}
                aria-pressed={view === "board"}
                style={{
                  padding: "4px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: view === "board" ? "var(--ink)" : "var(--ink-mute)",
                  background: view === "board" ? "var(--bg-2)" : "transparent",
                  /* longhand only — no `border` shorthand */
                  borderTop:    view === "board" ? "1px solid var(--rule)" : "1px solid transparent",
                  borderBottom: view === "board" ? "1px solid var(--rule)" : "1px solid transparent",
                  borderLeft:   view === "board" ? "1px solid var(--rule)" : "1px solid transparent",
                  borderRight:  "none",
                  borderRadius: "6px 0 0 6px",
                  cursor: "pointer",
                  minHeight: 30,
                  transition: "background 120ms ease-out, color 120ms ease-out, border-color 120ms ease-out",
                }}
              >
                Board
              </button>
              <button
                type="button"
                onClick={() => handleViewChange("list")}
                aria-pressed={view === "list"}
                style={{
                  padding: "4px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: view === "list" ? "var(--ink)" : "var(--ink-mute)",
                  background: view === "list" ? "var(--bg-2)" : "transparent",
                  /* longhand only — no `border` shorthand */
                  borderTop:    view === "list" ? "1px solid var(--rule)" : "1px solid transparent",
                  borderBottom: view === "list" ? "1px solid var(--rule)" : "1px solid transparent",
                  borderRight:  view === "list" ? "1px solid var(--rule)" : "1px solid transparent",
                  /* separator visible when List is inactive; matches active Board's right edge */
                  borderLeft:   view === "list" ? "1px solid var(--rule)" : "1px solid var(--rule-soft)",
                  borderRadius: "0 6px 6px 0",
                  cursor: "pointer",
                  minHeight: 30,
                  transition: "background 120ms ease-out, color 120ms ease-out, border-color 120ms ease-out",
                }}
              >
                List
              </button>
            </div>

            {/*
             * + Add alert — disabled placeholder until issue #25 ships.
             *
             * Shown always so the layout is stable; grayed via opacity.
             * aria-disabled conveys the disabled state to screen readers
             * without hiding the element. The native `disabled` attribute
             * prevents click events.
             */}
            <button
              type="button"
              disabled
              aria-label="Add alert — coming soon"
              title="Alert rules — coming soon"
              style={{
                padding: "4px 14px",
                fontSize: 12,
                fontWeight: 500,
                background: "var(--accent)",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                cursor: "not-allowed",
                opacity: 0.45,
                minHeight: 30,
                whiteSpace: "nowrap",
              }}
            >
              + Add alert
            </button>
          </div>
        </div>

        {/* Row 2: stats strip ─────────────────────────────────────────────
         *
         * Always shown. Reflects localStorage at render time:
         *   N saved · N active alerts [· last new match X]
         *
         * "last new match" is omitted when saved list is empty.
         */}
        <p
          className="tabular"
          style={{
            marginTop: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-mute)",
          }}
        >
          {saved.length} saved
          {" · "}
          {activeAlerts} active alert{activeAlerts !== 1 ? "s" : ""}
          {lastMatchText && (
            <> · last new match {lastMatchText}</>
          )}
        </p>
      </header>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {isEmpty ? (
        <EmptyState />
      ) : view === "list" ? (

        /* ── List view ─────────────────────────────────────────────────────
         *
         * Vertical list of all saved jobs, sorted by savedAt desc.
         * Simplified layout — no drag-and-drop; switch to Board for that.
         */
        <div
          className="flex flex-col gap-2"
          role="list"
          aria-label="Saved jobs list"
        >
          {listJobs.map((job) => (
            <SavedListRow
              key={job.id}
              job={job}
              onRemove={remove}
            />
          ))}
        </div>

      ) : (

        /* ── Board view ────────────────────────────────────────────────────
         *
         * Desktop (≥ 768px): CSS grid with 4 equal columns.
         * Mobile (< 768px):  horizontal flex with scroll-snap.
         * Both layouts defined in globals.css (.kanban-board / .kanban-column).
         */
        <div
          className="kanban-board"
          role="list"
          aria-label="Job tracker board"
        >
          {COLUMNS.map((col) => {
            const jobs   = saved.filter((j) => j.column === col.key);
            const count  = colCounts[col.key];
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
                  <span
                    className="font-semibold"
                    style={{ color: "var(--ink)", fontSize: 12 }}
                  >
                    {col.label}
                  </span>
                  <span
                    className="tabular"
                    style={{
                      color: "var(--ink-mute)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                    }}
                    aria-hidden
                  >
                    {count}
                  </span>
                  <span className="flex-1" />
                  {/*
                   * ··· column-actions button — placeholder for a future menu.
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

                {/* ── Column body (drop zone) ──────────────────────────── */}
                <div
                  onDragEnter={(e) => handleDragEnter(e, col.key)}
                  onDragOver={handleDragOver}
                  onDragLeave={(e) => handleDragLeave(e, col.key)}
                  onDrop={(e) => handleDrop(e, col.key)}
                  /* aria-dropeffect is deprecated in ARIA 1.2 but retained for AT compat */
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
