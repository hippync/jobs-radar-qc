"use client";

// Re-exports SavedPageClient as a client-component boundary.
//
// Previously this used dynamic(() => import(...), { ssr: false }) to
// suppress SSR entirely. That pattern works in the Pages Router but
// causes React error #418 (hydration mismatch) in the App Router because
// Next.js still server-renders "use client" boundaries to generate the
// initial HTML, so the dynamic-null vs client-content diff triggers a
// hydration error.
//
// The correct App Router fix is to render a deterministic initial state
// on both server and client (empty arrays / defaults), then load the real
// localStorage / sessionStorage values inside useEffect — which
// SavedPageClient now does. No dynamic() wrapper needed.
export { default } from "./SavedPageClient";
