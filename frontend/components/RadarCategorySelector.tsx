"use client";

/**
 * RadarCategorySelector — lets users pick exactly 4 of the 10 canonical
 * radar sectors. Selection is encoded in the URL (?cats=) and persisted
 * to localStorage so it survives navigation and page refreshes.
 *
 * Chip interaction model:
 *   - Clicking a selected chip when 4 are active: no-op (keeps 4).
 *   - Clicking an unselected chip when 4 are active: replaces the oldest
 *     selected chip (first in array) with the clicked one — FIFO queue.
 *   - Clicking an unselected chip when fewer than 4 are active: adds it.
 *
 * State model: `selected` is derived from the URL (?cats=) on every render
 * via useSearchParams(). There is no local useState for the selection —
 * the URL is the single source of truth. This avoids the need to call
 * setState inside a useEffect (which triggers cascading renders).
 */

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ALL_CAT_SLUGS,
  CANONICAL,
  CATEGORY_LABELS,
  DEFAULT_CATS,
  catToCssSlug,
  parseCatsParam,
} from "@/lib/radarHelpers";

const STORAGE_KEY = "jobs-radar-qc:radar-cats";

interface Props {
  /** Server-resolved initial selection (from ?cats= or defaults). */
  selectedCats: string[];
}

export function RadarCategorySelector({ selectedCats: initialCats }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * Derive current selection from the URL on every render.
   * Falls back to the server-resolved initialCats when ?cats= is absent
   * (first visit, direct URL, back-navigation without params, etc.).
   */
  const catsInUrl = searchParams.get("cats");
  const selected = catsInUrl
    ? parseCatsParam(catsInUrl, CANONICAL, DEFAULT_CATS)
    : initialCats;

  /**
   * On mount only: if ?cats= is absent from the URL, try to restore the
   * last selection from localStorage. Calling router.replace() updates the
   * URL, which causes useSearchParams() to return the new value and `selected`
   * to reflect the stored cats — no setState needed.
   */
  useEffect(() => {
    if (catsInUrl) return; // URL already has cats — honour it, skip restore

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = parseCatsParam(stored, CANONICAL, DEFAULT_CATS);
      if (parsed.join(",") === initialCats.join(",")) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("cats", parsed.join(","));
      router.replace(`/trends?${params.toString()}`, { scroll: false });
    } catch {
      // localStorage not available (SSR or private mode) — ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount

  function handleChipClick(slug: string) {
    if (selected.includes(slug)) {
      // Cannot go below 4 — clicking a selected chip is a no-op.
      return;
    }

    // Replace the oldest selected category (first element) when at capacity.
    const newCats =
      selected.length >= 4
        ? [...selected.slice(1), slug]
        : [...selected, slug];

    const params = new URLSearchParams(searchParams.toString());
    params.set("cats", newCats.join(","));
    router.replace(`/trends?${params.toString()}`, { scroll: false });

    try {
      localStorage.setItem(STORAGE_KEY, newCats.join(","));
    } catch {
      // storage not available — ignore
    }
  }

  return (
    <div>
      {/* Header row */}
      <div className="mb-2 flex items-center justify-between">
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{
            color: "var(--ink-mute)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
          }}
        >
          Radar sectors
        </span>
        <span
          aria-live="polite"
          aria-atomic="true"
          style={{
            color: "var(--ink-mute)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
          }}
        >
          {selected.length} / 4
        </span>
      </div>

      {/* Chip grid — wraps in 2 rows on narrow containers */}
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Select 4 radar sectors"
      >
        {ALL_CAT_SLUGS.map((slug) => {
          const isActive = selected.includes(slug);
          const cssSlug = catToCssSlug(slug);
          const label = CATEGORY_LABELS[slug];

          return (
            <button
              key={slug}
              type="button"
              aria-pressed={isActive}
              /*
               * Selected chips at capacity (4/4) are semantically "already
               * active" but cannot be toggled off. We do not use `disabled`
               * because disabled removes the element from the focus order;
               * instead we keep the button interactive but make it a no-op.
               * aria-pressed conveys the pressed state to screen readers.
               */
              onClick={() => handleChipClick(slug)}
              style={{
                minHeight: 32,        /* desktop; ≥44 handled via padding on mobile */
                padding: "5px 10px",
                borderRadius: 999,
                border: `1px solid ${
                  isActive ? `var(--cat-${cssSlug})` : "var(--rule-soft)"
                }`,
                background: isActive
                  ? `var(--cat-${cssSlug})`
                  : "var(--bg-2)",
                color: isActive ? "var(--on-accent)" : "var(--ink-soft)",
                fontFamily: "var(--font-sans)",
                fontSize: 11,
                fontWeight: isActive ? 600 : 400,
                cursor: isActive ? "default" : "pointer",
                transition: "background 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out",
                /* Ensure keyboard focus ring is visible */
                outline: "none",
              }}
              /* Focus ring is applied via globals.css [data-cat]:focus-visible rule */
              data-cat={cssSlug}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Hint text */}
      <p
        className="mt-1.5"
        style={{
          color: "var(--ink-mute)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
        }}
      >
        Click to swap · oldest sector replaced when full
      </p>
    </div>
  );
}
