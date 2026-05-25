/**
 * RouteLoading
 *
 * Shared loading UI consumed by all three route loading.tsx files:
 *   app/loading.tsx            → /
 *   app/trends/loading.tsx     → /trends
 *   app/saved/loading.tsx      → /saved
 *
 * In Next.js App Router, loading.tsx is rendered INSIDE layout.tsx,
 * which means the full shell (TopNav header + BottomTabBar) is already
 * visible on-screen — this component only needs to fill the {children}
 * slot with:
 *   1. A blank content area at var(--bg).
 *   2. A thin (2 px ≤ 3 px max) indeterminate progress bar at var(--accent)
 *      positioned at the very top of the content area.
 *
 * Animation:
 *   - Pure CSS keyframes defined in globals.css (.route-progress-fill).
 *   - No third-party library, no animate-pulse, no skeleton placeholders.
 *   - Stops (becomes a static 30 % fill) under prefers-reduced-motion.
 *
 * Accessibility:
 *   - role="progressbar" on the track element.
 *   - aria-label provides a terse description for screen readers.
 *   - The animated inner fill carries aria-hidden — its parent conveys meaning.
 *   - No live-region announcements (aria-live omitted to avoid noise on
 *     fast transitions).
 */
export default function RouteLoading() {
  return (
    <div
      /*
       * flex-1: grows to fill the space between the sticky header and
       * footer in layout.tsx's flex-col body.
       * position: relative: provides the containing block for the
       * absolutely-positioned progress bar track.
       */
      className="flex-1"
      style={{ background: "var(--bg)", position: "relative" }}
    >
      {/* ── Progress bar track ──────────────────────────────────────────── */}
      <div
        role="progressbar"
        aria-label="Loading page"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,           /* 2 px — well within the ≤ 3 px spec */
          overflow: "hidden",
          background: "transparent",
        }}
      >
        {/* Accent fill — animated via .route-progress-fill in globals.css */}
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
    </div>
  );
}
