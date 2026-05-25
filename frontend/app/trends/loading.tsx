/**
 * app/trends/loading.tsx — route-level loading state for "/trends"
 *
 * Shown while TrendsPage fetches radar data from Supabase (revalidate = 3600,
 * so a cache miss triggers a full server render).  The layout shell
 * (TopNav + BottomTabBar) is already visible from layout.tsx.
 *
 * Renders: blank content area + 2 px indeterminate accent progress bar.
 * No skeleton loaders, no fake chart placeholders. See §7 of ux-ui_agent.md.
 */
import RouteLoading from "@/components/RouteLoading";

export default function Loading() {
  return <RouteLoading />;
}
