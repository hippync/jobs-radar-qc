"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState } from "react";

const SENIORITY_OPTIONS = [
  { value: "internship", label: "Intern" },
  { value: "junior",     label: "Junior" },
  { value: "senior",     label: "Senior" },
  { value: "lead",       label: "Lead" },
  { value: "staff",      label: "Staff" },
  { value: "principal",  label: "Principal" },
  { value: "manager",    label: "Manager" },
  { value: "director",   label: "Director" },
];

const WORKPLACE_OPTIONS = [
  { value: "true",  label: "Remote" },
  { value: "null",  label: "Hybrid" },
  { value: "false", label: "On-site" },
];

interface Props {
  techOptions: string[];
  sourceOptions: string[];
  sourceCounts: Record<string, number>;
  seniorityCounts: Record<string, number>;
  workplaceCounts: Record<string, number>;
}

function SectionHeader({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between py-1.5 text-left"
      aria-expanded={open}
    >
      <span
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--ink-mute)", fontSize: 10 }}
      >
        {title}
      </span>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        aria-hidden
        style={{
          color: "var(--ink-mute)",
          transform: open ? "rotate(180deg)" : "none",
          transition: "transform 120ms ease-out",
        }}
      >
        <path d="M2 4l4 4 4-4" />
      </svg>
    </button>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors"
      style={{
        background: active ? "var(--accent-12)" : "transparent",
        color: active ? "var(--accent)" : "var(--ink-soft)",
        border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
        fontSize: 12,
        transition: "all 120ms ease-out",
      }}
    >
      <span style={{ fontWeight: active ? 600 : 400 }}>{label}</span>
      {count !== undefined && (
        <span
          className="tabular"
          style={{
            color: active ? "var(--accent)" : "var(--ink-mute)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export default function FilterSidebar({
  techOptions,
  sourceOptions,
  sourceCounts,
  seniorityCounts,
  workplaceCounts,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [techSearch, setTechSearch] = useState("");

  const [sections, setSections] = useState({
    source:    true,
    workplace: true,
    seniority: true,
    tech:      true,
  });

  function toggle(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (next.get(key) === value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.delete("page");
    startTransition(() => router.replace(`?${next.toString()}`));
  }

  function toggleSection(key: keyof typeof sections) {
    setSections((s) => ({ ...s, [key]: !s[key] }));
  }

  const currentTech      = params.get("tech")      ?? "";
  const currentSource    = params.get("source")    ?? "";
  const currentRemote    = params.get("remote")    ?? "";
  const currentSeniority = params.get("seniority") ?? "";

  const filteredTechs = techOptions.filter((t) =>
    t.toLowerCase().includes(techSearch.toLowerCase())
  );

  return (
    <aside
      className="flex flex-col gap-1"
      style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 120ms" }}
      aria-label="Job filters"
    >
      {/* Source */}
      <div style={{ borderBottom: "1px solid var(--rule-soft)", paddingBottom: 8, marginBottom: 4 }}>
        <SectionHeader
          title="Source"
          open={sections.source}
          onToggle={() => toggleSection("source")}
        />
        {sections.source && (
          <div className="mt-1 flex flex-col gap-0.5">
            {sourceOptions.map((s) => (
              <FilterChip
                key={s}
                label={s.charAt(0).toUpperCase() + s.slice(1)}
                count={sourceCounts[s]}
                active={currentSource === s}
                onClick={() => toggle("source", s)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Workplace */}
      <div style={{ borderBottom: "1px solid var(--rule-soft)", paddingBottom: 8, marginBottom: 4 }}>
        <SectionHeader
          title="Workplace"
          open={sections.workplace}
          onToggle={() => toggleSection("workplace")}
        />
        {sections.workplace && (
          <div className="mt-1 flex flex-col gap-0.5">
            {WORKPLACE_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                count={workplaceCounts[opt.value]}
                active={currentRemote === opt.value}
                onClick={() => toggle("remote", opt.value)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Seniority */}
      <div style={{ borderBottom: "1px solid var(--rule-soft)", paddingBottom: 8, marginBottom: 4 }}>
        <SectionHeader
          title="Seniority"
          open={sections.seniority}
          onToggle={() => toggleSection("seniority")}
        />
        {sections.seniority && (
          <div className="mt-1 flex flex-col gap-0.5">
            {SENIORITY_OPTIONS.filter((o) => (seniorityCounts[o.value] ?? 0) > 0).map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                count={seniorityCounts[opt.value]}
                active={currentSeniority === opt.value}
                onClick={() => toggle("seniority", opt.value)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Tech */}
      <div>
        <SectionHeader
          title="Technology"
          open={sections.tech}
          onToggle={() => toggleSection("tech")}
        />
        {sections.tech && (
          <div className="mt-1 flex flex-col gap-0.5">
            <input
              type="search"
              placeholder="Search tech…"
              value={techSearch}
              onChange={(e) => setTechSearch(e.target.value)}
              className="mb-1 w-full rounded-md px-2.5 py-1.5 text-xs outline-none"
              style={{
                background: "var(--bg-2)",
                border: "1px solid var(--rule-soft)",
                color: "var(--ink)",
                fontSize: 12,
              }}
              aria-label="Search technologies"
            />
            <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto">
              {filteredTechs.slice(0, 60).map((t) => (
                <FilterChip
                  key={t}
                  label={t}
                  active={currentTech === t}
                  onClick={() => toggle("tech", t)}
                />
              ))}
              {filteredTechs.length === 0 && (
                <p
                  className="px-2 py-1 text-xs"
                  style={{ color: "var(--ink-mute)" }}
                >
                  No match
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
