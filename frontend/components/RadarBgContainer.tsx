"use client";

import { useCallback, useSyncExternalStore } from "react";

type BgPref = "light" | "dark" | null;
const STORAGE_KEY = "jobs-radar-qc:radar-bg";
// Custom event keeps the radar in sync across the same tab on write.
const BG_CHANGE_EVENT = "jobs-radar-qc:radar-bg-change";

// Defined outside the component so subscribe/snapshot refs are stable.
function readStorage(): BgPref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    return null;
  }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(BG_CHANGE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(BG_CHANGE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

// Mirrored from globals.css — scoped only to the radar container so SVG
// gridlines and labels stay readable when forcing white on dark or black on light.
interface CSSVarsStyle extends React.CSSProperties {
  [key: `--${string}`]: string;
}

const LIGHT_OVERRIDES: CSSVarsStyle = {
  background: "#ffffff",
  "--surface":   "#ffffff",
  "--ink":       "oklch(0.22 0.005 85)",
  "--ink-soft":  "oklch(0.42 0.008 85)",
  "--ink-mute":  "oklch(0.62 0.01 85)",
  "--rule-soft": "oklch(0.81 0.012 85)",
};

const DARK_OVERRIDES: CSSVarsStyle = {
  background: "#000000",
  "--surface":   "#000000",
  "--ink":       "oklch(0.95 0.005 240)",
  "--ink-soft":  "oklch(0.72 0.008 240)",
  "--ink-mute":  "oklch(0.55 0.008 240)",
  "--rule-soft": "oklch(0.25 0.005 240)",
};

export function RadarBgContainer({ children }: { children: React.ReactNode }) {
  // useSyncExternalStore handles SSR (server snapshot = null = follow theme)
  // and avoids calling setState inside an effect.
  const bgPref = useSyncExternalStore(subscribe, readStorage, () => null);

  const handleSelect = useCallback(
    (pref: "light" | "dark") => {
      const next = bgPref === pref ? null : pref;
      try {
        if (next) localStorage.setItem(STORAGE_KEY, next);
        else localStorage.removeItem(STORAGE_KEY);
        window.dispatchEvent(new Event(BG_CHANGE_EVENT));
      } catch {
        // Private browsing or storage unavailable
      }
    },
    [bgPref],
  );

  const containerStyle: CSSVarsStyle = {
    border: "1px solid var(--rule-soft)",
    minHeight: 340,
    ...(bgPref === "light"
      ? LIGHT_OVERRIDES
      : bgPref === "dark"
        ? DARK_OVERRIDES
        : { background: "var(--surface)" }),
  };

  return (
    <div className="relative flex-1 rounded-md" style={containerStyle}>
      {/* BG toggle chips
          Hard-coded with light-mode values so they remain legible on any
          radar background (white, black, or theme-default). These are UI
          controls and must not inherit the radar-local CSS variable overrides. */}
      <div
        role="group"
        aria-label="Radar background"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 10,
          display: "flex",
          gap: 2,
          background: "#f3efe6",        // --bg-2 light-mode value (not var())
          border: "1px solid #c4bdaf",  // --rule-soft light-mode value (not var())
          borderRadius: 999,
          padding: "2px",
        }}
      >
        {(["light", "dark"] as const).map((pref) => {
          const isActive = bgPref === pref;
          const activeBg    = pref === "light" ? "#ffffff" : "#000000";
          const activeColor = pref === "light" ? "#1d1b18" : "#f0f0f0";
          const activeBorder = pref === "light" ? "#1d1b18" : "#e0e0e0";
          return (
            <button
              key={pref}
              type="button"
              aria-pressed={isActive}
              onClick={() => handleSelect(pref)}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6fe0] focus-visible:ring-offset-1"
              style={{
                minHeight: 28,
                padding: "3px 10px",
                borderRadius: 999,
                border: isActive
                  ? `1.5px solid ${activeBorder}`
                  : "1.5px solid transparent",
                background: isActive ? activeBg : "transparent",
                color: isActive ? activeColor : "#4a463f", // --ink-soft light-mode
                fontFamily: "var(--font-sans)",
                fontSize: 11,
                fontWeight: isActive ? 600 : 400,
                cursor: "pointer",
                lineHeight: 1,
                transition:
                  "background 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out",
              }}
            >
              {pref === "light" ? "Light" : "Dark"}
            </button>
          );
        })}
      </div>

      {children}
    </div>
  );
}
