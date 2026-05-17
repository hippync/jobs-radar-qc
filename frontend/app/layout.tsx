import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jobs Radar QC | The Quebec tech job market, indexed daily.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-950">
        <nav className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link
              href="/"
              className="text-sm font-semibold text-zinc-950 transition-colors hover:text-blue-600"
            >
              Jobs Radar QC
            </Link>
            <div className="flex items-center gap-5">
              <Link
                href="/trends"
                className="text-sm text-zinc-500 transition-colors hover:text-zinc-950"
              >
                Tech Radar
              </Link>
              <a
                href="https://github.com/hippync/jobs-radar-qc"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-zinc-500 transition-colors hover:text-zinc-950"
              >
                GitHub ↗
              </a>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
