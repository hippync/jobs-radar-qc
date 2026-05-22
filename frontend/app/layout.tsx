import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "Jobs Radar /qc | The Quebec tech job market, indexed daily.",
  description:
    "Active tech job postings from Montreal and Quebec companies, pulled directly from Greenhouse, Lever, and Workable. Updated daily.",
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
      <body className="flex min-h-full flex-col" style={{ background: "var(--bg)", color: "var(--ink)" }}>
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

            {/* Nav links */}
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
      </body>
    </html>
  );
}
