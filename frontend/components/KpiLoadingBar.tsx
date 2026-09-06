"use client";

import { useFilterTransition } from "./FilterTransitionProvider";

/**
 * Thin accent progress bar shown over the KPI strip while a filter
 * navigation is pending (issue #144). Same visual language as
 * RouteLoading's route-level indicator — no skeleton/pulsing placeholders,
 * per agents/ux-ui_agent.md §7 ("No skeleton loaders... Never project a
 * fake layout"). Renders nothing when idle.
 */
export default function KpiLoadingBar() {
  const { isPending } = useFilterTransition();
  if (!isPending) return null;

  return (
    <div
      role="progressbar"
      aria-label="Updating results"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        overflow: "hidden",
        background: "transparent",
      }}
    >
      <div
        aria-hidden="true"
        className="route-progress-fill"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "100%",
          width: "40%",
          background: "var(--accent)",
          borderRadius: 1,
        }}
      />
    </div>
  );
}
