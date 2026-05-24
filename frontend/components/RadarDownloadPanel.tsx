"use client";

/**
 * RadarDownloadPanel — embed/API card in the /trends side rail.
 *
 * Shows dynamic curl commands and a direct SVG download link for the
 * currently selected radar categories. Updates in real-time as the user
 * swaps sectors via RadarCategorySelector.
 *
 * Both curl commands point to /api/radar (issue #62).
 */

import { useState } from "react";

const BASE_URL = "https://jobs-radar-qc.dev";

interface Props {
  /** The 4 currently selected category slugs from the URL / defaults. */
  cats: string[];
}

interface CopyState {
  json: boolean;
  svg: boolean;
}

export function RadarDownloadPanel({ cats }: Props) {
  const catStr = cats.join(",");
  const jsonCmd = `curl "${BASE_URL}/api/radar?format=json&cats=${catStr}"`;
  const svgCmd  = `curl "${BASE_URL}/api/radar?format=svg&cats=${catStr}"`;
  // Relative path so the download link works in both dev and production.
  const svgHref = `/api/radar?format=svg&cats=${catStr}`;

  const [copied, setCopied] = useState<CopyState>({ json: false, svg: false });

  async function copy(text: string, key: keyof CopyState) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => setCopied((prev) => ({ ...prev, [key]: false })), 1800);
    } catch {
      // Clipboard not available — silently ignore
    }
  }

  return (
    <div
      className="rounded-md p-3"
      style={{ background: "var(--ink)", color: "var(--bg)" }}
    >
      {/* JSON endpoint */}
      <CurlRow
        label="JSON"
        cmd={jsonCmd}
        copied={copied.json}
        onCopy={() => copy(jsonCmd, "json")}
      />

      {/* SVG endpoint */}
      <CurlRow
        label="SVG"
        cmd={svgCmd}
        copied={copied.svg}
        onCopy={() => copy(svgCmd, "svg")}
        className="mt-2"
      />

      {/* Download SVG link */}
      <div className="mt-2 flex items-center justify-between">
        <a
          href={svgHref}
          download="radar.svg"
          style={{
            color: "var(--accent)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            textDecoration: "none",
            opacity: 0.85,
          }}
        >
          Download SVG
        </a>
        <span
          style={{
            color: "var(--ink-mute)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
          }}
        >
          embed-ready
        </span>
      </div>

      {/* Footer note */}
      <p
        className="mt-1.5"
        style={{
          color: "var(--ink-mute)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          lineHeight: 1.5,
        }}
      >
        MIT-licensed open data · works in a GitHub README
      </p>
    </div>
  );
}

/* ── Sub-component ───────────────────────────────────────────────────────── */

function CurlRow({
  label,
  cmd,
  copied,
  onCopy,
  className = "",
}: {
  label: string;
  cmd: string;
  copied: boolean;
  onCopy: () => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-0.5 flex items-center justify-between gap-1">
        <span
          style={{
            color: "var(--accent)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            opacity: 0.8,
          }}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={`Copy ${label} curl command`}
          style={{
            background: "transparent",
            border: "none",
            padding: "2px 4px",
            borderRadius: 3,
            cursor: "pointer",
            color: copied ? "var(--accent)" : "var(--ink-mute)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            transition: "color 120ms ease-out",
          }}
        >
          {copied ? "copied!" : "copy"}
        </button>
      </div>
      <div
        className="flex items-center gap-1"
        style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}
      >
        <span style={{ color: "var(--accent)" }}>$</span>
        <span
          style={{
            opacity: 0.8,
            overflowX: "auto",
            whiteSpace: "nowrap",
            /* hide scrollbar on webkit while keeping scrollability */
            scrollbarWidth: "none",
          }}
        >
          {cmd.replace(/^curl /, "")}
        </span>
      </div>
    </div>
  );
}
