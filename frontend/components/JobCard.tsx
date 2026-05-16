import { Job } from "@/lib/types";

const SENIORITY_BADGE: Record<string, string> = {
  internship: "bg-amber-50 text-amber-600 ring-1 ring-amber-200",
  junior:     "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  senior:     "bg-violet-100 text-violet-700 ring-1 ring-violet-200",
  lead:       "bg-violet-100 text-violet-800 ring-1 ring-violet-200",
  staff:      "bg-violet-200 text-violet-900 ring-1 ring-violet-300",
  principal:  "bg-violet-200 text-violet-900 ring-1 ring-violet-300",
  manager:    "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
  director:   "bg-slate-100 text-slate-800 ring-1 ring-slate-200",
};

function remoteLabel(is_remote: boolean | null) {
  if (is_remote === true)  return { label: "Remote",  cls: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200" };
  if (is_remote === false) return { label: "On-site", cls: "bg-slate-100 text-slate-600 ring-1 ring-slate-200" };
  return                          { label: "Hybrid",  cls: "bg-amber-100 text-amber-700 ring-1 ring-amber-200" };
}

function age(iso: string | null): { text: string; fresh: boolean } {
  if (!iso) return { text: "", fresh: false };
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff === 0) return { text: "today",     fresh: true };
  if (diff === 1) return { text: "yesterday", fresh: true };
  if (diff <= 3)  return { text: `${diff}d ago`, fresh: true };
  return                 { text: `${diff}d ago`, fresh: false };
}

export default function JobCard({ job }: { job: Job }) {
  const { label: remLabel, cls: remCls } = remoteLabel(job.is_remote);
  const senCls = job.seniority ? SENIORITY_BADGE[job.seniority] ?? "bg-slate-100 text-slate-600" : null;
  const { text: ageText, fresh } = age(job.first_seen_at);

  return (
    <a
      href={job.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-150 hover:border-violet-300 hover:shadow-md hover:shadow-violet-100"
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
            {job.company}
          </p>
          <h2 className="mt-0.5 line-clamp-2 text-sm font-semibold text-slate-900 group-hover:text-violet-700">
            {job.title}
          </h2>
          {job.location && (
            <p className="mt-0.5 truncate text-xs text-slate-400">{job.location}</p>
          )}
        </div>
        {ageText && (
          <span
            className={`shrink-0 text-xs font-medium ${
              fresh ? "text-emerald-500" : "text-slate-300"
            }`}
          >
            {fresh && <span className="mr-1">●</span>}
            {ageText}
          </span>
        )}
      </div>

      {/* Badges */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${remCls}`}>
          {remLabel}
        </span>

        {senCls && (
          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${senCls}`}>
            {job.seniority}
          </span>
        )}

        {job.employment_type && (
          <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
            {job.employment_type}
          </span>
        )}

        {job.tech_stack.slice(0, 4).map((t) => (
          <span
            key={t}
            className="inline-flex items-center rounded-md bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-600 ring-1 ring-violet-200"
          >
            {t}
          </span>
        ))}
        {job.tech_stack.length > 4 && (
          <span className="self-center text-xs text-slate-300">
            +{job.tech_stack.length - 4}
          </span>
        )}
      </div>
    </a>
  );
}
