import { Job } from "@/lib/types";
import SaveButton from "./SaveButton";
import { AlertMatchRing, AlertMatchChip } from "./AlertMatchHighlight";
import TechChips from "./TechChips";
import { CANONICAL, buildTechToCatMap } from "@/lib/radarHelpers";

const TECH_TO_CAT = buildTechToCatMap(CANONICAL);

/**
 * Category priority for surfacing "distinctive" tech tags first (issue
 * #139) — cloud/devops infra (AWS, Docker, CI/CD, Terraform...) shows up on
 * nearly every listing, so it's pushed toward the "+N" overflow in favor of
 * languages, frameworks, and other tags that actually differentiate a role.
 */
const DISTINCTIVENESS_ORDER = [
  "languages", "ai_concepts", "databases", "mobile", "frontend",
  "backend", "data", "testing", "other", "devops", "cloud",
];

function sortByDistinctiveness(techs: string[]): string[] {
  const rank = (t: string) => {
    const idx = DISTINCTIVENESS_ORDER.indexOf(TECH_TO_CAT[t] ?? "other");
    return idx === -1 ? DISTINCTIVENESS_ORDER.length : idx;
  };
  return [...techs].sort((a, b) => rank(a) - rank(b));
}

const SENIORITY_LABEL: Record<string, string> = {
  internship: "Intern",
  junior:     "Junior",
  senior:     "Senior",
  lead:       "Lead",
  staff:      "Staff",
  principal:  "Principal",
  manager:    "Manager",
  director:   "Director",
};

const SOURCE_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  workable: "Workable",
};

function remoteLabel(is_remote: boolean | null): string | null {
  if (is_remote === true)  return "Remote";
  if (is_remote === false) return "On-site";
  return null;
}

function age(iso: string | null): { text: string; fresh: boolean } {
  if (!iso) return { text: "", fresh: false };
  const diffMs    = Date.now() - new Date(iso).getTime();
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays  = Math.floor(diffMs / 86_400_000);
  const fresh     = diffDays <= 1;
  if (diffHours < 1)  return { text: "just now",       fresh };
  if (diffHours < 24) return { text: `${diffHours}h ago`, fresh };
  return                     { text: `${diffDays}d ago`,  fresh };
}

/* Company logo placeholder — first 2 initials in a fixed-size box */
function LogoPlaceholder({ company }: { company: string }) {
  const initials = company
    .split(/[\s\-&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded text-xs font-semibold"
      style={{
        width: 28, height: 28,
        background: "var(--bg-2)",
        border: "1px solid var(--rule-soft)",
        color: "var(--ink-mute)",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        letterSpacing: "0.04em",
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export default function JobCard({ job }: { job: Job }) {
  const { text: ageText, fresh } = age(job.first_seen_at);
  const CHIP_MAX = 4;

  return (
    <div
      className="group relative flex min-w-0 flex-col rounded-md"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--rule-soft)",
        /* Left accent stripe — 3 px, blue if fresh, muted otherwise */
        borderLeft: `3px solid ${fresh ? "var(--accent)" : "var(--rule-soft)"}`,
        transition: "border-color 120ms ease-out, box-shadow 120ms ease-out",
      }}
    >
      <AlertMatchRing job={job} />
      <div className="flex flex-col gap-2 p-4 pb-3">
        {/* ── Header: logo + company + location + age ── */}
        <div className="flex items-start gap-2">
          <LogoPlaceholder company={job.company} />
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--ink-soft)", fontFamily: "var(--font-mono)", fontSize: 11 }}
              title={job.company}
            >
              {job.company}
            </p>
            {job.location && (
              <p
                className="truncate text-xs"
                style={{ color: "var(--ink-mute)", fontSize: 11 }}
                title={job.location}
              >
                {job.location}
              </p>
            )}
          </div>
          {ageText && (
            <div
              className="flex shrink-0 items-center gap-1 text-xs"
              style={{ color: fresh ? "var(--accent)" : "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 10 }}
            >
              {fresh && (
                <span
                  className="inline-block rounded-full"
                  style={{ width: 5, height: 5, background: "var(--accent)", flexShrink: 0 }}
                  aria-hidden
                />
              )}
              {ageText}
            </div>
          )}

          {/* ── Save to /saved (Watching column) ── */}
          <SaveButton
            id={job.id}
            company={job.company}
            title={job.title}
            source={job.source}
            source_url={job.source_url}
            location={job.location}
            first_seen_at={job.first_seen_at}
            tech_stack={job.tech_stack}
          />
        </div>

        {/* ── Title ── */}
        <h2
          className="line-clamp-2 text-sm font-semibold leading-snug transition-colors"
          style={{ color: "var(--ink)", fontSize: 13.5 }}
          title={job.title}
        >
          {job.title}
        </h2>

        {/* ── Level / workplace / source chips ── */}
        <div className="flex flex-wrap items-center gap-1">
          {job.seniority && SENIORITY_LABEL[job.seniority] && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
              style={{
                background: "var(--bg-2)",
                color: "var(--ink-soft)",
                border: "1px solid var(--rule-soft)",
                fontSize: 11,
              }}
            >
              {SENIORITY_LABEL[job.seniority]}
            </span>
          )}
          {remoteLabel(job.is_remote) && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
              style={{
                background: "var(--bg-2)",
                color: "var(--ink-soft)",
                border: "1px solid var(--rule-soft)",
                fontSize: 11,
              }}
            >
              {remoteLabel(job.is_remote)}
            </span>
          )}
          <AlertMatchChip job={job} />
        </div>

        {/* ── Tech chips ── */}
        <TechChips techs={sortByDistinctiveness(job.tech_stack)} max={CHIP_MAX} />
      </div>

      {/* ── Footer: view link ── */}
      <div
        className="mt-auto flex items-center px-4 py-2.5"
        style={{ borderTop: "1px solid var(--rule-soft)" }}
      >
        <a
          href={job.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs transition-colors"
          style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 11 }}
          aria-label={`View ${job.title} at ${job.company} on ${SOURCE_LABEL[job.source] ?? job.source}`}
        >
          view on {SOURCE_LABEL[job.source] ?? job.source}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <path d="M2 8L8 2M4 2h4v4" />
          </svg>
        </a>
      </div>
    </div>
  );
}
