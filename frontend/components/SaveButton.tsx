"use client";

import { useEffect, useState } from "react";

/* ── localStorage contract (must stay in sync with SavedPageClient.tsx) ── */
const STORAGE_KEY = "jobs-radar-qc:saved";

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

function loadSaved(): SavedJob[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSaved(jobs: SavedJob[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {}
}

/* ── Props ──────────────────────────────────────────────────────────────── */
export interface SaveButtonProps {
  id: string;
  company: string;
  title: string;
  source: string;
  source_url: string;
  location: string | null;
  first_seen_at: string;
  tech_stack: string[];
}

/* ── Component ──────────────────────────────────────────────────────────── */
export default function SaveButton({
  id,
  company,
  title,
  source,
  source_url,
  location,
  first_seen_at,
  tech_stack,
}: SaveButtonProps) {
  // Start as false (safe for SSR). useEffect syncs from localStorage after hydration.
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Reading localStorage in an effect is the correct SSR pattern: the lazy
    // useState initializer would cause a server/client hydration mismatch because
    // `window` is unavailable during server render. The linter rule is suppressed
    // for this reason — this is intentional, not an anti-pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(loadSaved().some((j) => j.id === id));
  }, [id]);

  function toggle() {
    const jobs = loadSaved();

    if (saved) {
      persistSaved(jobs.filter((j) => j.id !== id));
      setSaved(false);
    } else {
      const entry: SavedJob = {
        id,
        company,
        title,
        source,
        source_url,
        location,
        first_seen_at,
        tech_stack,
        column: "watching",
        savedAt: Date.now(),
      };
      // Prepend so the newest saved job appears first on /saved
      persistSaved([entry, ...jobs.filter((j) => j.id !== id)]);
      setSaved(true);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        saved
          ? `Retirer "${title}" des emplois sauvegardés`
          : `Sauvegarder "${title}"`
      }
      aria-pressed={saved}
      className="flex shrink-0 items-center justify-center rounded"
      style={{
        /*
         * 44 × 44 px touch target — required by §5 (a11y, mobile).
         * Negative margin compensates for the extra space in the flex row
         * so the card padding stays unchanged.
         */
        width: 44,
        height: 44,
        marginTop: -8,
        marginRight: -8,
        marginBottom: -8,
        color: saved ? "var(--accent)" : "var(--ink-mute)",
        background: "none",
        border: "none",
        cursor: "pointer",
        transition: "color 120ms ease-out",
      }}
    >
      {/* Lucide `star` — filled when saved, outline otherwise. Stroke 1.5. */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        focusable="false"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  );
}
