/**
 * SegmentFilter — role segment selector for the Tech Stack Radar.
 *
 * Renders "All" + one pill per segment. Clicking a pill navigates to
 * /trends?segment=<slug>&cats=...&window=... — preserving all other params.
 *
 * Server Component: uses <Link> elements (no client JS needed).
 * Active state is conveyed by both visual style and aria-current so it works
 * without relying on colour alone.
 *
 * Props:
 *   activeSegment  — currently active slug, or null for "All"
 *   activeWindow   — current ?window= value (preserved in generated hrefs)
 */

import Link from "next/link";
import { ALL_SEGMENT_SLUGS, SEGMENT_LABELS } from "@/lib/segmentHelpers";
import { DEFAULT_CATS, SEGMENT_DEFAULT_CATS } from "@/lib/radarHelpers";
import type { WindowOption } from "@/lib/radarData";

interface Props {
  activeSegment: string | null;
  activeWindow: WindowOption;
}

export function SegmentFilter({ activeSegment, activeWindow }: Props) {
  /**
   * Build a href that sets ?segment=<slug> and ?cats= to the segment's preset
   * sectors. "All" (null) resets to global defaults.
   */
  function href(slug: string | null): string {
    const cats = slug
      ? [...(SEGMENT_DEFAULT_CATS[slug] ?? DEFAULT_CATS)]
      : [...DEFAULT_CATS];
    const params = new URLSearchParams();
    params.set("cats", cats.join(","));
    params.set("window", activeWindow);
    if (slug) params.set("segment", slug);
    return `/trends?${params.toString()}`;
  }

  const allItems: Array<{ slug: string | null; label: string }> = [
    { slug: null, label: "All" },
    ...ALL_SEGMENT_SLUGS.map((slug) => ({ slug, label: SEGMENT_LABELS[slug] })),
  ];

  return (
    <div>
      {/* Section header */}
      <div className="mb-2">
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{
            color: "var(--ink-mute)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
          }}
        >
          Role segment
        </span>
      </div>

      {/* Pill row */}
      <nav aria-label="Filter by role segment" className="flex flex-wrap gap-1.5">
        {allItems.map(({ slug, label }) => {
          const isActive = slug === activeSegment;
          return (
            <Link
              key={slug ?? "all"}
              href={href(slug)}
              scroll={false}
              aria-current={isActive ? "page" : undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 28,
                padding: "4px 10px",
                borderRadius: 999,
                border: `1px solid ${
                  isActive ? "var(--accent)" : "var(--rule-soft)"
                }`,
                background: isActive ? "var(--accent)" : "transparent",
                color: isActive ? "var(--on-accent)" : "var(--ink-soft)",
                fontFamily: "var(--font-sans)",
                fontSize: 11,
                fontWeight: isActive ? 600 : 400,
                textDecoration: "none",
                transition:
                  "background 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out",
                cursor: "pointer",
                /* Ensure keyboard focus ring is visible — ring applied via
                   focus-visible in globals.css; outline:none suppresses native ring
                   in favour of the custom one. */
                outline: "none",
              }}
              /* Inline focus-visible ring as inline style fallback */
              onFocus={undefined}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Hint */}
      <p
        className="mt-1.5"
        style={{
          color: "var(--ink-mute)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
        }}
      >
        Sectors adapt to the selected segment
      </p>
    </div>
  );
}
