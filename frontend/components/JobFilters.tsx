"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface Props {
  techOptions: string[];
  sourceOptions: string[];
}

const SELECT_CLS =
  "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm " +
  "focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 " +
  "transition hover:border-slate-300";

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
    <div className={`flex flex-wrap items-center gap-2 ${isPending ? "opacity-50 pointer-events-none" : ""}`}>
      <select value={tech} onChange={(e) => update("tech", e.target.value)} className={SELECT_CLS}>
        <option value="">All technologies</option>
        {techOptions.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>

      <select value={source} onChange={(e) => update("source", e.target.value)} className={SELECT_CLS}>
        <option value="">All sources</option>
        {sourceOptions.map((s) => (
          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
        ))}
      </select>

      <select value={remote} onChange={(e) => update("remote", e.target.value)} className={SELECT_CLS}>
        <option value="">Any workplace</option>
        <option value="true">Remote</option>
        <option value="false">On-site</option>
        <option value="null">Hybrid</option>
      </select>

      <select value={seniority} onChange={(e) => update("seniority", e.target.value)} className={SELECT_CLS}>
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

      {hasFilters && (
        <button
          onClick={() => startTransition(() => router.replace("/"))}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-400 transition hover:border-violet-300 hover:text-violet-600"
        >
          Clear
        </button>
      )}
    </div>
  );
}
