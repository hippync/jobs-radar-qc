/**
 * app/saved/loading.tsx — route-level loading state for "/saved"
 *
 * SavedPage is a thin wrapper around SavedPageClient ("use client").
 * Although the server-side render itself is fast (no data fetching),
 * a loading.tsx is added for consistency and to cover the brief hydration
 * window on slower devices / connections.  The layout shell
 * (TopNav + BottomTabBar) is already visible from layout.tsx.
 *
 * Renders: blank content area + 2 px indeterminate accent progress bar.
 * No skeleton Kanban columns, no ghost cards. See §7 of ux-ui_agent.md.
 */
import RouteLoading from "@/components/RouteLoading";

export default function Loading() {
  return <RouteLoading />;
}
