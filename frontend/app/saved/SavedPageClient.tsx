"use client";

import { useState } from "react";
import Link from "next/link";

/* ── Types ──────────────────────────────────────────────────────────── */
type Column = "watching" | "applied" | "interviewing" | "archived";

interface SavedJob {
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

/* ── Column config ──────────────────────────────────────────────────── */
const COLUMNS: Array<{
  key: Column;
  label: string;
  color: string;
  bg: string;
}> = [
  { key: "watching",     label: "Watching",     color: "var(--accent)",   bg: "var(--accent-12)" },
  { key: "applied",      label: "Applied",       color: "#b8860b",         bg: "#fef9e7" },
  { key: "interviewing", label: "Interviewing",  color: "var(--gh-fg)",    bg: "var(--gh-bg)" },
  { key: "archived",     label: "Archived",      color: "var(--ink-mute)", bg: "var(--bg-2)" },
];

/* ── Helpers ────────────────────────────────────────────────────────── */
function ageText(iso: string | null): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  return `${diff}d`;
}

const SOURCE_COLORS: Record<string, { label: string; fg: string; bg: string }> = {
  greenhouse: { label: "GH", fg: "var(--gh-fg)", bg: "var(--gh-bg)" },
  lever:      { label: "LV", fg: "var(--lv-fg)", bg: "var(--lv-bg)" },
  workable:   { label: "WK", fg: "var(--wk-fg)", bg: "var(--wk-bg)" },
};

function MiniSourceBadge({ source }: { source: string }) {
  const s = SOURCE_COLORS[source];
  if (!s) return null;
  return (
    <span
      className="rounded px-1.5 py-0.5 text-xs font-semibold"
      style={{ background: s.bg, color: s.fg, fontFamily: "var(--font-mono)", fontSize: 9 }}
    >
      {s.label}
    </span>
  );
}

/* ── Saved Job Card ─────────────────────────────────────────────────── */
function SavedCard({
  job,
  onMove,
  onRemove,
}: {
  job: SavedJob;
  onMove: (id: string, col: Column) => void;
  onRemove: (id: string) => void;
}) {
  const age = ageText(job.first_seen_at);

  return (
    <div
      className="flex flex-col gap-2 rounded-md p-3"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--rule-soft)",
        borderLeft: "3px solid var(--accent)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="truncate text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 9, flex: 1 }}
        >
          {job.company}
        </span>
        {age && (
          <span
            className="text-xs"
            style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 9, flexShrink: 0 }}
          >
            {age}
          </span>
        )}
      </div>

      <p
        className="line-clamp-2 text-sm font-semibold leading-snug"
        style={{ color: "var(--ink)", fontSize: 12.5 }}
        title={job.title}
      >
        {job.title}
      </p>

      <div className="flex items-center gap-2">
        <MiniSourceBadge source={job.source} />

        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onMove(job.id, e.target.value as Column);
          }}
          aria-label="Move to column"
          className="flex-1 rounded px-1 py-0.5 text-xs"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--rule-soft)",
            color: "var(--ink-soft)",
            fontSize: 10,
          }}
        >
          <option value="">Move to…</option>
          {COLUMNS.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>

        <a
          href={job.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-0.5 text-xs"
          style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 10, flexShrink: 0 }}
          aria-label={`Open ${job.title} on ${job.source}`}
        >
          open
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <path d="M1.5 7.5L7.5 1.5M3.5 1.5h4v4" />
          </svg>
        </a>

        <button
          onClick={() => onRemove(job.id)}
          className="text-xs transition-colors"
          style={{ color: "var(--ink-mute)", flexShrink: 0 }}
          aria-label="Remove from saved"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <path d="M2 2l8 8M10 2L2 10" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-full"
        style={{ background: "var(--bg-2)", border: "1px solid var(--rule-soft)" }}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden style={{ color: "var(--ink-mute)" }}>
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
        style={{ background: "var(--accent)", color: "white" }}
      >
        Browse jobs
      </Link>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */

// Component is loaded with ssr:false so window is always available.
// No useEffect needed for the initial localStorage read.
export default function SavedPageClient() {
  const [saved, setSaved] = useState<SavedJob[]>(() => loadSaved());
  const [activeCol, setActiveCol] = useState<Column>("watching");

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

  const isEmpty = saved.length === 0;
  const colCounts = Object.fromEntries(
    COLUMNS.map((c) => [c.key, saved.filter((j) => j.column === c.key).length])
  ) as Record<Column, number>;
  const visibleJobs = saved.filter((j) => j.column === activeCol);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
          Saved jobs
        </h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--ink-mute)" }}>
          Tracked locally in your browser · no account needed
        </p>
      </div>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <div
            className="mb-4 flex gap-1 overflow-x-auto pb-1"
            role="tablist"
            aria-label="Tracker columns"
          >
            {COLUMNS.map((col) => {
              const active = activeCol === col.key;
              return (
                <button
                  key={col.key}
                  onClick={() => setActiveCol(col.key)}
                  role="tab"
                  aria-selected={active}
                  className="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm"
                  style={{
                    background: active ? col.bg : "transparent",
                    color: active ? col.color : "var(--ink-mute)",
                    border: `1px solid ${active ? col.color : "var(--rule-soft)"}`,
                    fontWeight: active ? 600 : 400,
                    fontSize: 12,
                    transition: "all 120ms ease-out",
                  }}
                >
                  <span
                    className="inline-block rounded-full"
                    style={{ width: 6, height: 6, background: col.color, flexShrink: 0 }}
                    aria-hidden
                  />
                  {col.label}
                  {colCounts[col.key] > 0 && (
                    <span
                      className="tabular"
                      style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.65 }}
                    >
                      {colCounts[col.key]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            aria-label={COLUMNS.find((c) => c.key === activeCol)?.label}
          >
            {visibleJobs.length === 0 ? (
              <div
                className="rounded-md py-16 text-center"
                style={{ border: "1.5px dashed var(--rule-soft)" }}
              >
                <p className="text-sm" style={{ color: "var(--ink-mute)" }}>
                  No jobs in {COLUMNS.find((c) => c.key === activeCol)?.label} yet.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleJobs.map((job) => (
                  <SavedCard
                    key={job.id}
                    job={job}
                    onMove={move}
                    onRemove={remove}
                  />
                ))}
              </div>
            )}
          </div>

          <p
            className="mt-6 text-center text-xs"
            style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}
          >
            {saved.length} job{saved.length !== 1 ? "s" : ""} saved · stored in this browser only
          </p>
        </>
      )}
    </div>
  );
}
