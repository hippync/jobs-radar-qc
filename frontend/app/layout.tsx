import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import BottomTabBar from "@/components/BottomTabBar";
import SearchPalette from "@/components/SearchPalette";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jobs-radar-qc.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Jobs Radar QC",
    template: "%s · Jobs Radar QC",
  },
  description:
    "Open-source radar for tech jobs, skills, and hiring trends in Montreal and Quebec.",
  openGraph: {
    siteName: "Jobs Radar QC",
    locale: "en_CA",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Jobs Radar QC — Tech jobs in Montreal and Quebec",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full`}
    >
      {/*
        * pb-14 (56 px) reserves room below scrollable content so nothing hides
        * behind the fixed BottomTabBar on mobile.
        * lg:pb-0 removes that padding on desktop where the bar is hidden.
        */}
      <body className="flex min-h-full flex-col pb-14 lg:pb-0" style={{ background: "var(--bg)", color: "var(--ink)" }}>
        {/* Top navigation */}
        <header
          className="sticky top-0 z-40 border-b"
          style={{ background: "var(--surface)", borderColor: "var(--rule-soft)" }}
        >
          <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            {/* Wordmark */}
            <Link
              href="/"
              className="flex items-center gap-1 text-sm font-bold tracking-tight"
              style={{ color: "var(--ink)" }}
            >
              <span>Jobs Radar</span>
              <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>/qc</span>
            </Link>

            {/* Nav links + search */}
            <div className="flex items-center gap-5">
              <Link
                href="/"
                className="text-sm transition-colors"
                style={{ color: "var(--ink-soft)" }}
              >
                Jobs
              </Link>
              <Link
                href="/trends"
                className="text-sm transition-colors"
                style={{ color: "var(--ink-soft)" }}
              >
                Radar
              </Link>
              <Link
                href="/saved"
                className="text-sm transition-colors"
                style={{ color: "var(--ink-soft)" }}
              >
                Saved
              </Link>
              <a
                href="https://github.com/hippync/jobs-radar-qc"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm transition-colors"
                style={{ color: "var(--ink-mute)" }}
              >
                GitHub
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <path d="M2 8L8 2M4 2h4v4" />
                </svg>
              </a>
              {/* ⌘K / Ctrl+K search palette trigger */}
              <SearchPalette />
            </div>
          </nav>
        </header>

        {children}

        <footer className="border-t py-5" style={{ borderColor: "var(--rule-soft)" }}>
          <p className="text-center text-xs" style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>
            Open source ·{" "}
            <a
              href="https://github.com/hippync/jobs-radar-qc"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:underline"
              style={{ color: "var(--accent)" }}
            >
              github.com/hippync/jobs-radar-qc
            </a>
          </p>
        </footer>

        {/* Mobile bottom navigation — hidden on lg+ where the top nav suffices */}
        <BottomTabBar />
      </body>
    </html>
  );
}
