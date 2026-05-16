import { Job } from "@/lib/types";

const SENIORITY_COLORS: Record<string, string> = {
  internship: "bg-purple-100 text-purple-700",
  junior:     "bg-green-100 text-green-700",
  senior:     "bg-blue-100 text-blue-700",
  lead:       "bg-orange-100 text-orange-700",
  staff:      "bg-red-100 text-red-700",
  principal:  "bg-red-100 text-red-800",
  manager:    "bg-yellow-100 text-yellow-800",
  director:   "bg-gray-100 text-gray-800",
};

function remoteLabel(is_remote: boolean | null) {
  if (is_remote === true) return { label: "Remote", cls: "bg-emerald-100 text-emerald-700" };
  if (is_remote === false) return { label: "On-site", cls: "bg-gray-100 text-gray-600" };
  return { label: "Hybrid", cls: "bg-sky-100 text-sky-700" };
}

function daysAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  return `${diff}d ago`;
}

export default function JobCard({ job }: { job: Job }) {
  const { label: remLabel, cls: remCls } = remoteLabel(job.is_remote);
  const senCls = job.seniority ? SENIORITY_COLORS[job.seniority] ?? "bg-gray-100 text-gray-600" : null;

  return (
    <a
      href={job.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-indigo-600">{job.company}</p>
          <h2 className="mt-0.5 truncate text-sm font-semibold text-gray-900 group-hover:text-indigo-700">
            {job.title}
          </h2>
          {job.location && (
            <p className="mt-0.5 truncate text-xs text-gray-500">{job.location}</p>
          )}
        </div>
        <span className="shrink-0 text-xs text-gray-400">{daysAgo(job.first_seen_at)}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${remCls}`}>
          {remLabel}
        </span>

        {senCls && (
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${senCls}`}>
            {job.seniority}
          </span>
        )}

        {job.employment_type && (
          <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
            {job.employment_type}
          </span>
        )}

        {job.tech_stack.slice(0, 4).map((t) => (
          <span
            key={t}
            className="inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-600"
          >
            {t}
          </span>
        ))}
        {job.tech_stack.length > 4 && (
          <span className="text-xs text-gray-400">+{job.tech_stack.length - 4}</span>
        )}
      </div>
    </a>
  );
}
