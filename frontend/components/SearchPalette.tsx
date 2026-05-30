"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SourceBadge from "./SourceBadge";

interface SearchResult {
  id: string;
  title: string;
  company: string;
  source: string;
  source_url: string;
  tech_stack: string[];
}

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

export default function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery("");
    setResults([]);
    setActiveIndex(-1);
    setLoading(false);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    // Return focus to the trigger after the overlay unmounts.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  // Global keyboard shortcut: ⌘K (Mac) / Ctrl+K (Win/Linux).
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) closePalette();
        else openPalette();
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [open, openPalette, closePalette]);

  // Autofocus input when palette opens.
  useEffect(() => {
    if (open) {
      // Small delay so the element is mounted and transition has started.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keyboard navigation and focus trap while palette is open.
  useEffect(() => {
    if (!open) return;

    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closePalette();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }

      if (e.key === "Enter") {
        const result = results[activeIndex];
        if (result) {
          window.open(result.source_url, "_blank", "noopener,noreferrer");
          closePalette();
        }
        return;
      }

      // Tab focus trap: cycle within dialog.
      if (e.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [open, closePalette, results, activeIndex]);

  // Debounced fetch to /api/search.
  // All setState calls are inside the timer callback to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    // Short queries clear immediately (0 ms); real queries debounce 300 ms.
    const delay = trimmed.length < 2 ? 0 : 300;

    debounceRef.current = setTimeout(async () => {
      if (trimmed.length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data: { results: SearchResult[] } = await res.json();
        setResults(data.results ?? []);
        setActiveIndex(-1);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, delay);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const shortcutHint = isMac ? "⌘K" : "Ctrl+K";

  return (
    <>
      {/* ── Trigger button in TopNav ─────────────────────────────────── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={openPalette}
        aria-label={`Open quick search (${shortcutHint})`}
        aria-keyshortcuts={isMac ? "Meta+k" : "Control+k"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 6,
          border: "1px solid var(--rule-soft)",
          background: "var(--bg)",
          color: "var(--ink-mute)",
          cursor: "pointer",
          transition: "border-color 120ms ease-out, color 120ms ease-out",
          minHeight: 32,
          /* Ensure 44px touch target on mobile via padding expansion */
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-soft)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--rule-soft)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-mute)";
        }}
      >
        {/* Search icon (Lucide search, 14px) */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <span
          className="hidden sm:inline"
          style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}
        >
          {shortcutHint}
        </span>
      </button>

      {/* ── Palette overlay ──────────────────────────────────────────── */}
      {open && (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(29, 27, 24, 0.45)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "clamp(48px, 10vh, 120px)",
            paddingLeft: 16,
            paddingRight: 16,
          }}
          onClick={closePalette}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Quick search"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 560,
              background: "var(--surface)",
              border: "1px solid var(--rule-soft)",
              borderRadius: 8,
              overflow: "hidden",
              boxShadow: "0 8px 32px rgba(29,27,24,0.18)",
            }}
          >
            {/* ── Search input row ── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderBottom: "1px solid var(--rule-soft)",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: "var(--ink-mute)", flexShrink: 0 }}
                aria-hidden
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search roles, companies, or technologies..."
                autoComplete="off"
                spellCheck={false}
                aria-label="Search jobs"
                aria-autocomplete="list"
                aria-controls="search-results"
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: 14,
                  color: "var(--ink)",
                  fontFamily: "var(--font-sans)",
                }}
              />
              {loading && (
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    border: "2px solid var(--rule-soft)",
                    borderTopColor: "var(--accent)",
                    animation: "spin 0.6s linear infinite",
                    flexShrink: 0,
                  }}
                  aria-hidden
                />
              )}
              <kbd
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  color: "var(--ink-mute)",
                  background: "var(--bg-2)",
                  border: "1px solid var(--rule-soft)",
                  borderRadius: 3,
                  padding: "1px 5px",
                  flexShrink: 0,
                  display: "none",
                }}
                /* Hidden visually but present — shown on wider screens */
                className="hidden sm:block"
              >
                Esc
              </kbd>
            </div>

            {/* ── Results list ── */}
            <ul
              id="search-results"
              role="listbox"
              aria-label="Search results"
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                maxHeight: 380,
                overflowY: "auto",
              }}
            >
              {results.length === 0 && query.trim().length >= 2 && !loading && (
                <li
                  style={{
                    padding: "28px 16px",
                    textAlign: "center",
                    fontSize: 13,
                    color: "var(--ink-mute)",
                  }}
                >
                  No results for &ldquo;{query.trim()}&rdquo;
                </li>
              )}

              {results.length === 0 && query.trim().length < 2 && (
                <li
                  style={{
                    padding: "20px 16px",
                    textAlign: "center",
                    fontSize: 12,
                    color: "var(--ink-mute)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  Type to search across all active roles
                </li>
              )}

              {results.map((result, i) => (
                <ResultRow
                  key={result.id}
                  result={result}
                  active={i === activeIndex}
                  onSelect={() => {
                    window.open(result.source_url, "_blank", "noopener,noreferrer");
                    closePalette();
                  }}
                  onHover={() => setActiveIndex(i)}
                  query={query.trim()}
                />
              ))}
            </ul>

            {/* ── Footer hint ── */}
            {results.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "6px 14px",
                  borderTop: "1px solid var(--rule-soft)",
                  background: "var(--bg)",
                }}
              >
                <HintKey label="↑↓" desc="navigate" />
                <HintKey label="↵" desc="open" />
                <HintKey label="Esc" desc="close" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Spin keyframe for loading indicator */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

function ResultRow({
  result,
  active,
  onSelect,
  onHover,
  query,
}: {
  result: SearchResult;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
  query: string;
}) {
  const TECH_MAX = 3;
  const lq = query.toLowerCase();
  // Highlight up to 3 tech chips; prioritize chips that match the query.
  const sortedTech = [...result.tech_stack].sort((a, b) => {
    const aMatch = a.toLowerCase().includes(lq) ? -1 : 0;
    const bMatch = b.toLowerCase().includes(lq) ? -1 : 0;
    return aMatch - bMatch;
  });

  return (
    <li
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
    >
      <button
        type="button"
        onClick={onSelect}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          width: "100%",
          padding: "10px 14px",
          border: "none",
          background: active ? "var(--accent-12)" : "transparent",
          cursor: "pointer",
          textAlign: "left",
          borderLeft: `3px solid ${active ? "var(--accent)" : "transparent"}`,
          transition: "background 80ms ease-out, border-color 80ms ease-out",
          outline: "none",
        }}
        aria-label={`${result.title} at ${result.company}`}
      >
        {/* Company initials */}
        <CompanyInitials company={result.company} />

        {/* Text content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--ink-mute)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {result.company}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginBottom: 4,
            }}
            title={result.title}
          >
            {result.title}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
            <SourceBadge source={result.source} />
            {sortedTech.slice(0, TECH_MAX).map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  padding: "1px 5px",
                  borderRadius: 3,
                  border: "1px solid var(--rule-soft)",
                  background: t.toLowerCase().includes(lq) ? "var(--accent-12)" : "var(--bg-2)",
                  color: t.toLowerCase().includes(lq) ? "var(--accent)" : "var(--ink-soft)",
                  fontWeight: t.toLowerCase().includes(lq) ? 600 : 400,
                }}
              >
                {t}
              </span>
            ))}
            {result.tech_stack.length > TECH_MAX && (
              <span style={{ fontSize: 10, color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>
                +{result.tech_stack.length - TECH_MAX}
              </span>
            )}
          </div>
        </div>

        {/* External link icon */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          style={{ color: "var(--ink-mute)", flexShrink: 0, marginTop: 2, opacity: active ? 1 : 0.4 }}
          aria-hidden
        >
          <path d="M2 8L8 2M4 2h4v4" />
        </svg>
      </button>
    </li>
  );
}

function CompanyInitials({ company }: { company: string }) {
  const initials = company
    .split(/[\s\-&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      style={{
        width: 28,
        height: 28,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 4,
        background: "var(--bg-2)",
        border: "1px solid var(--rule-soft)",
        fontSize: 9,
        fontFamily: "var(--font-mono)",
        fontWeight: 600,
        color: "var(--ink-mute)",
        letterSpacing: "0.04em",
        marginTop: 1,
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

function HintKey({ label, desc }: { label: string; desc: string }) {
  return (
    <span
      style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--ink-mute)" }}
    >
      <kbd
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          background: "var(--surface)",
          border: "1px solid var(--rule-soft)",
          borderRadius: 3,
          padding: "1px 5px",
        }}
      >
        {label}
      </kbd>
      <span>{desc}</span>
    </span>
  );
}
