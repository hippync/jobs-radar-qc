"use client";

import dynamic from "next/dynamic";

// ssr:false is only allowed in Client Components with Turbopack.
// This wrapper makes it legal: page.tsx (Server) → SavedWrapper (Client) → SavedPageClient.
const SavedPageClient = dynamic(() => import("./SavedPageClient"), { ssr: false });

export default function SavedWrapper() {
  return <SavedPageClient />;
}
