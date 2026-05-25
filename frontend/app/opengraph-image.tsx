/**
 * Root Open Graph image — served at /opengraph-image
 * Rendered by Next.js Edge Runtime via ImageResponse (next/og).
 *
 * Design follows brand tokens from agents/ux-ui_agent.md:
 *   - Warm off-white background  (#faf7f0 — --bg)
 *   - Ink text                   (#1d1b18 — --ink)
 *   - Accent blue on /qc         (#2f6fe0 — --accent)
 *   - Secondary text             (#4a463f — --ink-soft)
 *   - URL / meta line            (#8a8478 — --ink-mute)
 * No gradients, no emoji, no map, no shadows.
 */

import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Jobs Radar QC — Tech jobs in Montreal and Quebec";

export const size = { width: 1200, height: 630 };

export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#faf7f0",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "80px 88px",
          position: "relative",
        }}
      >
        {/* Top rule */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "#2f6fe0",
          }}
        />

        {/* Wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            marginBottom: "36px",
          }}
        >
          <span
            style={{
              fontSize: "80px",
              fontWeight: 700,
              color: "#1d1b18",
              letterSpacing: "-3px",
              lineHeight: 1,
            }}
          >
            Jobs Radar
          </span>
          <span
            style={{
              fontSize: "80px",
              fontWeight: 700,
              color: "#2f6fe0",
              letterSpacing: "-3px",
              lineHeight: 1,
              marginLeft: "12px",
              fontFamily: "monospace",
            }}
          >
            /qc
          </span>
        </div>

        {/* Tagline */}
        <p
          style={{
            fontSize: "30px",
            color: "#4a463f",
            fontWeight: 400,
            lineHeight: 1.45,
            margin: 0,
            maxWidth: "820px",
          }}
        >
          Open-source radar for tech jobs, skills, and hiring trends in
          Montreal and Quebec.
        </p>

        {/* Bottom meta row */}
        <div
          style={{
            position: "absolute",
            bottom: "56px",
            left: "88px",
            right: "88px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "20px", color: "#8a8478" }}>
            jobs-radar-qc.vercel.app
          </span>
          <span
            style={{
              fontSize: "16px",
              color: "#8a8478",
              fontFamily: "monospace",
              background: "#f3efe6",
              padding: "6px 14px",
              borderRadius: "4px",
            }}
          >
            Open source
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
