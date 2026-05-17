"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface Props {
  techOptions: string[];
  sourceOptions: string[];
}

const BASE_SELECT =
  "rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-700 " +
  "focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 " +
  "transition-colors hover:border-zinc-300";

const ACTIVE_SELECT =
  "rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-sm text-blue-700 " +
  "focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 " +
  "transition-colors";

export default function JobFilters({ techOptions, sourceOptions }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.replace(`?${next.toString()}`));
  }

  const tech      = params.get("tech")      ?? "";
  const source    = params.get("source")    ?? "";
  const remote    = params.get("remote")    ?? "";
  const seniority = params.get("seniority") ?? "";
  const hasFilters = !!(tech || source || remote || seniority);

  return (
    <div
      className={`flex flex-nowrap items-center gap-2 overflow-x-auto ${
        isPending ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <span className="shrink-0 text-xs font-medium text-zinc-400">Filter:</span>

      <select
        value={tech}
        onChange={(e) => update("tech", e.target.value)}
        aria-label="Filter by technology"
        className={tech ? ACTIVE_SELECT : BASE_SELECT}
      >
        <option value="">All technologies</option>
        {techOptions.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <select
        value={seniority}
        onChange={(e) => update("seniority", e.target.value)}
        aria-label="Filter by seniority"
        className={seniority ? ACTIVE_SELECT : BASE_SELECT}
      >
        <option value="">All levels</option>
        <option value="internship">Internship</option>
        <option value="junior">Junior</option>
        <option value="senior">Senior</option>
        <option value="lead">Lead</option>
        <option value="staff">Staff</option>
        <option value="principal">Principal</option>
        <option value="manager">Manager</option>
        <option value="director">Director</option>
      </select>

      <select
        value={remote}
        onChange={(e) => update("remote", e.target.value)}
        aria-label="Filter by workplace"
        className={remote ? ACTIVE_SELECT : BASE_SELECT}
      >
        <option value="">Any workplace</option>
        <option value="true">Remote</option>
        <option value="false">On-site</option>
        <option value="null">Hybrid</option>
      </select>

      <select
        value={source}
        onChange={(e) => update("source", e.target.value)}
        aria-label="Filter by ATS source"
        className={source ? ACTIVE_SELECT : BASE_SELECT}
      >
        <option value="">All sources</option>
        {sourceOptions.map((s) => (
          <option key={s} value={s}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </option>
        ))}
      </select>

      {hasFilters && (
        <button
          onClick={() => startTransition(() => router.replace("/"))}
          className="shrink-0 rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-400 transition-colors hover:border-blue-200 hover:text-blue-600"
        >
          × Clear
        </button>
      )}
    </div>
  );
}
