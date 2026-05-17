import { Job } from "@/lib/types";
import SourceBadge from "./SourceBadge";

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

function remoteLabel(is_remote: boolean | null): string {
  if (is_remote === true)  return "Remote";
  if (is_remote === false) return "On-site";
  return "Hybrid";
}

function age(iso: string | null): { text: string; fresh: boolean } {
  if (!iso) return { text: "", fresh: false };
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff === 0) return { text: "today",     fresh: true };
  if (diff === 1) return { text: "yesterday", fresh: true };
  return               { text: `${diff}d`,   fresh: false };
}

export default function JobCard({ job }: { job: Job }) {
  const { text: ageText, fresh } = age(job.first_seen_at);

  return (
    <a
      href={job.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col rounded-lg border border-zinc-200 border-l-2 border-l-zinc-200 bg-white p-4 transition-all hover:border-zinc-300 hover:border-l-blue-500 hover:shadow-sm"
    >
      {/* Company + age */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          {job.company}
        </p>
        {ageText && (
          <span
            className={`shrink-0 text-xs ${
              fresh ? "font-medium text-blue-500" : "text-zinc-300"
            }`}
          >
            {fresh && "● "}{ageText}
          </span>
        )}
      </div>

      {/* Title */}
      <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-900 transition-colors group-hover:text-blue-600">
        {job.title}
      </h2>

      {/* Location */}
      {job.location && (
        <p className="mt-0.5 truncate text-xs text-zinc-400">{job.location}</p>
      )}

      {/* Status badges */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs text-zinc-500 ring-1 ring-zinc-200">
          {remoteLabel(job.is_remote)}
        </span>

        {job.seniority && SENIORITY_LABEL[job.seniority] && (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs text-zinc-500 ring-1 ring-zinc-200">
            {SENIORITY_LABEL[job.seniority]}
          </span>
        )}

        <SourceBadge source={job.source} />
      </div>

      {/* Tech chips */}
      {job.tech_stack.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {job.tech_stack.slice(0, 4).map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded bg-zinc-50 px-1.5 py-0.5 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200"
            >
              {t}
            </span>
          ))}
          {job.tech_stack.length > 4 && (
            <span className="self-center text-xs text-zinc-300">
              +{job.tech_stack.length - 4}
            </span>
          )}
        </div>
      )}
    </a>
  );
}
