"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type CSSProperties } from "react";

/* ─────────────────────────────────────────────────────────────────────────
 * Saved-count badge
 * Uses the same localStorage key and custom-event bus as SavedPageClient /
 * SaveButton so the badge stays in sync within the same tab without polling.
 * ─────────────────────────────────────────────────────────────────────── */
const STORAGE_KEY  = "jobs-radar-qc:saved";
const SAVED_CHANGE = "jobs-radar-qc:saved-change";

let _rawRef: string | null = null;
let _lenCache              = 0;

function getSavedCount(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === _rawRef) return _lenCache;
    _rawRef   = raw;
    _lenCache = raw ? (JSON.parse(raw) as unknown[]).length : 0;
    return _lenCache;
  } catch {
    _rawRef   = null;
    _lenCache = 0;
    return 0;
  }
}

function subscribeSaved(cb: () => void): () => void {
  window.addEventListener(SAVED_CHANGE, cb);
  window.addEventListener("storage",    cb);
  return () => {
    window.removeEventListener(SAVED_CHANGE, cb);
    window.removeEventListener("storage",    cb);
  };
}

/** Stable SSR snapshot — localStorage is unavailable on the server. */
function getServerCount(): number { return 0; }

/* ─────────────────────────────────────────────────────────────────────────
 * SVG Icons — Lucide-style, stroke 1.5, viewBox 0 0 24 24, rendered at 20 px
 * All icons carry aria-hidden; the tab's aria-label conveys the meaning.
 * ─────────────────────────────────────────────────────────────────────── */
function BriefcaseIcon() {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Badge pill — shown above the icon when count > 0.
 * aria-hidden: count is already woven into the tab's aria-label.
 * ─────────────────────────────────────────────────────────────────────── */
function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        top: 6,
        /* Push the badge right of center so it doesn't overlap the icon */
        left: "calc(50% + 4px)",
        background: "var(--accent)",
        color: "var(--surface)",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 600,
        minWidth: 14,
        height: 14,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 3px",
        lineHeight: 1,
      }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Active underline — 2 px accent strip at the bottom of the active tab.
 * ─────────────────────────────────────────────────────────────────────── */
function ActiveUnderline() {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: 24,
        height: 2,
        background: "var(--accent)",
        borderRadius: 1,
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Shared tab styles
 * ─────────────────────────────────────────────────────────────────────── */
const tabBase: CSSProperties = {
  position: "relative",
  display: "flex",
  flex: 1,
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 3,
  height: 54,       /* visual height of the tab strip */
  minHeight: 44,    /* a11y: minimum touch target */
  fontSize: 10,
  fontFamily: "var(--font-sans)",
  textDecoration: "none",
  transition: "color 120ms ease-out",
  cursor: "pointer",
  background: "none",
  border: "none",
};

/* ─────────────────────────────────────────────────────────────────────────
 * BottomTabBar
 * Rendered only on mobile via `lg:hidden`. The layout adds `pb-14 lg:pb-0`
 * to <body> so page content never scrolls behind the bar.
 * ─────────────────────────────────────────────────────────────────────── */
export default function BottomTabBar() {
  const pathname   = usePathname();
  const savedCount = useSyncExternalStore(subscribeSaved, getSavedCount, getServerCount);

  const active =
    pathname === "/"       ? "jobs"  :
    pathname === "/trends" ? "radar" :
    pathname === "/saved"  ? "saved" :
    pathname === "/about"  ? "about" :
    "none";

  function tabColor(key: string) {
    return active === key ? "var(--accent)" : "var(--ink-mute)";
  }

  function tabWeight(key: string): number {
    return active === key ? 600 : 400;
  }

  return (
    <nav
      /*
       * `flex` sets display:flex via a CSS class; `lg:hidden` sets display:none
       * at ≥1024px via a responsive class. Both are CSS-class rules — Tailwind's
       * responsive variant wins at the lg breakpoint because it is later in the
       * generated stylesheet. An inline style would permanently override lg:hidden,
       * so we intentionally keep display OUT of the style prop.
       */
      className="flex lg:hidden"
      role="tablist"
      aria-label="Navigation principale"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: "var(--surface)",
        borderTop: "1px solid var(--rule-soft)",
        /* Extend into the iOS home-indicator safe area */
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* ── Jobs ───────────────────────────────────────────────────────── */}
      <Link
        href="/"
        role="tab"
        aria-selected={active === "jobs"}
        aria-label="Jobs"
        className="btb-tab"
        style={{ ...tabBase, color: tabColor("jobs"), fontWeight: tabWeight("jobs") }}
      >
        <BriefcaseIcon />
        <span>Jobs</span>
        {active === "jobs" && <ActiveUnderline />}
      </Link>

      {/* ── Radar ──────────────────────────────────────────────────────── */}
      <Link
        href="/trends"
        role="tab"
        aria-selected={active === "radar"}
        aria-label="Radar"
        className="btb-tab"
        style={{ ...tabBase, color: tabColor("radar"), fontWeight: tabWeight("radar") }}
      >
        <ActivityIcon />
        <span>Radar</span>
        {active === "radar" && <ActiveUnderline />}
      </Link>

      {/* ── Saved ──────────────────────────────────────────────────────── */}
      <Link
        href="/saved"
        role="tab"
        aria-selected={active === "saved"}
        aria-label={savedCount > 0 ? `Saved, ${savedCount} enregistré${savedCount !== 1 ? "s" : ""}` : "Saved"}
        className="btb-tab"
        style={{ ...tabBase, color: tabColor("saved"), fontWeight: tabWeight("saved") }}
      >
        <StarIcon />
        <span>Saved</span>
        <CountBadge count={savedCount} />
        {active === "saved" && <ActiveUnderline />}
      </Link>

      {/* ── About ──────────────────────────────────────────────────────── */}
      <Link
        href="/about"
        role="tab"
        aria-selected={active === "about"}
        aria-label="About"
        className="btb-tab"
        style={{ ...tabBase, color: tabColor("about"), fontWeight: tabWeight("about") }}
      >
        <InfoIcon />
        <span>About</span>
        {active === "about" && <ActiveUnderline />}
      </Link>
    </nav>
  );
}
