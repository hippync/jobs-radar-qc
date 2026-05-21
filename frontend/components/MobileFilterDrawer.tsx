"use client";

import { useState } from "react";
import { Suspense } from "react";
import FilterSidebar from "./FilterSidebar";

interface Props {
  techOptions: string[];
  sourceOptions: string[];
  sourceCounts: Record<string, number>;
  seniorityCounts: Record<string, number>;
  workplaceCounts: Record<string, number>;
  activeFilterCount: number;
}

export default function MobileFilterDrawer({
  techOptions,
  sourceOptions,
  sourceCounts,
  seniorityCounts,
  workplaceCounts,
  activeFilterCount,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium"
        style={{
          background: activeFilterCount > 0 ? "var(--ink)" : "var(--bg-2)",
          color: activeFilterCount > 0 ? "var(--bg)" : "var(--ink)",
          border: `1px solid ${activeFilterCount > 0 ? "var(--ink)" : "var(--rule-soft)"}`,
          fontSize: 13,
        }}
        aria-label={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ""}`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
          <path d="M1 3h12M3 7h8M5 11h4" />
        </svg>
        Filters
        {activeFilterCount > 0 && (
          <span
            className="flex items-center justify-center rounded-full text-xs font-semibold"
            style={{
              width: 18,
              height: 18,
              background: "var(--accent)",
              color: "white",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
            }}
          >
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Backdrop + Drawer */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: "rgba(29, 27, 24, 0.5)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-auto flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl"
            style={{ background: "var(--surface)", border: "1.5px solid var(--rule-soft)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--rule-soft)" }}
            >
              <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                Filters
              </span>
              <button
                onClick={() => setOpen(false)}
                className="flex items-center justify-center rounded-full p-1.5 text-sm"
                style={{ color: "var(--ink-mute)", background: "var(--bg-2)" }}
                aria-label="Close filters"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M2 2l10 10M12 2L2 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable sidebar */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <Suspense>
                <FilterSidebar
                  techOptions={techOptions}
                  sourceOptions={sourceOptions}
                  sourceCounts={sourceCounts}
                  seniorityCounts={seniorityCounts}
                  workplaceCounts={workplaceCounts}
                />
              </Suspense>
            </div>

            {/* Apply button */}
            <div className="px-4 py-3" style={{ borderTop: "1px solid var(--rule-soft)" }}>
              <button
                onClick={() => setOpen(false)}
                className="w-full rounded-md py-2.5 text-sm font-semibold"
                style={{ background: "var(--accent)", color: "white" }}
              >
                Apply filters
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
