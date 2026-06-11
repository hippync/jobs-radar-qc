import type { Metadata } from "next";
import Link from "next/link";
import { SHARED_OG } from "@/lib/siteMetadata";

export const metadata: Metadata = {
  title: "About",
  description:
    "How Jobs Radar QC works: ATS sources, daily pipeline, Tech Stack Radar, and why Quebec.",
  openGraph: {
    ...SHARED_OG,
    title: "About · Jobs Radar QC",
    description:
      "How Jobs Radar QC works: ATS sources, daily pipeline, Tech Stack Radar, and why Quebec.",
    url: "/about",
  },
  alternates: {
    canonical: "/about",
  },
};

/* ── Section card wrapper ────────────────────────────────────────────────── */
function Section({
  title,
  label,
  children,
}: {
  title: string;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-md p-5"
      style={{ background: "var(--bg-2)", border: "1px solid var(--rule-soft)" }}
    >
      {label && (
        <span
          className="mb-1 block text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 9 }}
        >
          {label}
        </span>
      )}
      <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--ink)" }}>
        {title}
      </h2>
      <div className="space-y-2 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        {children}
      </div>
    </section>
  );
}

/* ── Inline code pill ────────────────────────────────────────────────────── */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--rule-soft)",
        color: "var(--ink-soft)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
      }}
    >
      {children}
    </span>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      {/* Page header */}
      <div className="mb-6 pb-5" style={{ borderBottom: "1.5px solid var(--rule-soft)" }}>
        <h1 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
          About Jobs Radar QC
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          An open-source ATS aggregator for the Quebec tech scene — updated daily, no sign-up required.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {/* What is Jobs Radar QC */}
        <Section title="What is Jobs Radar QC?" label="Project">
          <p>
            Jobs Radar QC collects tech job postings directly from company ATS pages across
            Montreal and Quebec, normalises them into a consistent schema, and surfaces them
            through a single searchable feed. No recruiter noise. No recycled listings.
          </p>
          <p>
            Alongside the job list, the{" "}
            <Link href="/trends" className="underline hover:no-underline" style={{ color: "var(--accent)" }}>
              Tech Stack Radar
            </Link>{" "}
            shows which technologies appear most across active roles — giving a live snapshot
            of what the market is actually asking for.
          </p>
        </Section>

        {/* What is an ATS */}
        <Section title="What is an ATS?" label="Context">
          <p>
            An <strong style={{ color: "var(--ink)" }}>Applicant Tracking System</strong> (ATS)
            is the software companies use to manage job postings and applications. When a company
            posts a role, it appears on their own ATS-hosted page — often before it lands on
            aggregators like LinkedIn or Indeed.
          </p>
          <p>
            Reading from these source pages gives more complete data: original job descriptions,
            structured company metadata, and a direct dedup key so the same role is never shown
            twice.
          </p>
        </Section>

        {/* Why these 4 sources */}
        <Section title="Why Greenhouse, Lever, Workable, and Workday?" label="Sources">
          <p>
            These four platforms are widely adopted among scale-ups, mid-market, and enterprise
            tech companies in Quebec. Their APIs are public, stable, and well-structured —
            making them more reliable than scraping generalist boards.
          </p>
          <p>
            They are also the systems most likely to host companies like Shopify, Lightspeed, Coveo,
            Ubisoft, and other Quebec tech employers. New ATS sources can be added by contributing
            a spec file to the repository.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["Greenhouse", "Lever", "Workable", "Workday"].map((s) => (
              <Chip key={s}>{s}</Chip>
            ))}
          </div>
        </Section>

        {/* How data is collected */}
        <Section title="How data is collected" label="Pipeline">
          <p>
            A deterministic pipeline runs every day via{" "}
            <strong style={{ color: "var(--ink)" }}>GitHub Actions</strong>. It fetches job
            listings from each ATS API, normalises them, extracts tech-stack signals using
            rule-based regex matching, and upserts them into a Supabase/PostgreSQL database.
          </p>
          <p>
            No LLM is involved in the daily collection — an Anthropic outage cannot affect the
            feed. The pipeline is designed to be fully deterministic and reproducible.
          </p>
        </Section>

        {/* How the radar is built */}
        <Section title="How the Tech Stack Radar is built" label="Radar">
          <p>
            The radar counts how many active job postings mention each technology. Higher counts
            mean the technology appears in more roles, not that it is trending up — it is a
            snapshot of current demand, not a time-series.
          </p>
          <p>
            A separate weekly enrichment pass uses an LLM to improve tech-stack signal on roles
            where rule-based extraction was incomplete. The radar should be read as a view of
            <strong style={{ color: "var(--ink)" }}> relative demand</strong> — not a precise
            market study.
          </p>
        </Section>

        {/* Why Quebec */}
        <Section title="Why Montreal / Quebec?" label="Scope">
          <p>
            The Quebec tech market has its own character: a bilingual context, a mix of
            international employers and local scale-ups, and a distinct talent ecosystem.
            Generic job boards aggregate noise from everywhere.
          </p>
          <p>
            Jobs Radar QC tracks only companies with an active ATS presence in the Quebec
            market, making the data more relevant for developers based here.
          </p>
        </Section>

        {/* Open source */}
        <Section title="Open source" label="Contribute">
          <p>
            Jobs Radar QC is fully open source under MIT. The extraction pipeline, enrichment
            agent, and this frontend are all in the same repository. Adding a company requires
            a one-line edit to a JSON spec file. Adding a new ATS requires three declarative
            files.
          </p>
          <div className="mt-3">
            <a
              href="https://github.com/hippync/jobs-radar-qc"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--rule-soft)",
                color: "var(--ink-soft)",
              }}
            >
              <svg
                width="14" height="14" viewBox="0 0 24 24"
                fill="currentColor" aria-hidden
              >
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              github.com/hippync/jobs-radar-qc
              <svg
                width="10" height="10" viewBox="0 0 10 10"
                fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                aria-hidden
              >
                <path d="M2 8L8 2M4 2h4v4" />
              </svg>
            </a>
          </div>
        </Section>
      </div>
    </main>
  );
}
