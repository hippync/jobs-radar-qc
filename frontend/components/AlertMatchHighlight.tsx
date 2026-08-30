"use client";

import { useAlerts, matchesAlert } from "@/lib/alertsStore";
import type { Job } from "@/lib/types";

function useAlertMatch(job: Job): boolean {
  const alerts = useAlerts();
  return alerts.some((a) => a.enabled && matchesAlert(job, a));
}

/**
 * Full-card ring overlay when the job matches an enabled saved alert
 * (issue #133 — Von Restorff effect). Absolute + pointer-events-none, so it
 * never intercepts clicks or shifts layout. Renders nothing on no match.
 */
export function AlertMatchRing({ job }: { job: Job }) {
  const matched = useAlertMatch(job);
  if (!matched) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-md"
      style={{ boxShadow: "0 0 0 2px var(--hilite-new)" }}
    />
  );
}

/**
 * Inline text badge for the job's chip row — flows with the other chips
 * instead of floating over other controls (e.g. SaveButton). This is the
 * non-color-alone signal; the ring above is the color signal.
 */
export function AlertMatchChip({ job }: { job: Job }) {
  const matched = useAlertMatch(job);
  if (!matched) return null;

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ background: "var(--hilite-new)", color: "var(--ink)", fontSize: 11 }}
    >
      Matches alert
    </span>
  );
}
