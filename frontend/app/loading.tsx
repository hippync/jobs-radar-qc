/**
 * app/loading.tsx — route-level loading state for "/"
 *
 * Next.js App Router renders this file in place of page.tsx while the
 * async Server Component fetches data (Supabase jobs + stats RPC).
 * The layout shell (TopNav + BottomTabBar) is already visible from
 * layout.tsx — no need to duplicate chrome here.
 *
 * Renders: blank content area + 2 px indeterminate accent progress bar.
 * No skeleton loaders, no pulsing placeholders. See §7 of ux-ui_agent.md.
 */
import RouteLoading from "@/components/RouteLoading";

export default function Loading() {
  return <RouteLoading />;
}
