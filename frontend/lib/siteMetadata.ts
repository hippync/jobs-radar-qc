/**
 * Shared Open Graph defaults imported by every route-level metadata export.
 *
 * Next.js App Router does NOT deep-merge `openGraph` between layout and page —
 * a page-level `openGraph` fully replaces the layout's. Including these shared
 * fields here ensures every page carries the full OG payload.
 */

export const OG_IMAGES = [
  {
    url: "/opengraph-image",
    width: 1200,
    height: 630,
    alt: "Jobs Radar QC — Tech jobs in Montreal and Quebec",
  },
];

/** Spread into every route's `openGraph` to keep site-level fields consistent. */
export const SHARED_OG = {
  siteName: "Jobs Radar QC",
  locale: "en_CA",
  type: "website" as const,
  images: OG_IMAGES,
};
