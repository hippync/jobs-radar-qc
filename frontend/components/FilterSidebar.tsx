"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ALL_CAT_SLUGS, CANONICAL, CATEGORY_LABELS, buildTechToCatMap } from "@/lib/radarHelpers";
import { useFilterTransition } from "./FilterTransitionProvider";

const OTHER_CAT = "other";
const TECH_CAT_ORDER = [...ALL_CAT_SLUGS, OTHER_CAT];
const TECH_TO_CAT = buildTechToCatMap(CANONICAL);

function techCategory(tech: string): string {
  return TECH_TO_CAT[tech] ?? OTHER_CAT;
}

function techCatLabel(cat: string): string {
  return CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? "Other";
}

const SENIORITY_DEFAULT = [
  { value: "internship", label: "Intern" },
  { value: "junior",     label: "Junior" },
  { value: "senior",     label: "Senior" },
  { value: "lead",       label: "Lead" },
];

const SENIORITY_MORE = [
  { value: "staff",      label: "Staff" },
  { value: "principal",  label: "Principal" },
  { value: "manager",    label: "Manager" },
  { value: "director",   label: "Director" },
];

const WORKPLACE_OPTIONS = [
  { value: "true",  label: "Remote" },
  { value: "null",  label: "Hybride / Non spécifié", tooltip: "Inclut les offres hybrides et celles sans information de localisation" },
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
  tooltip,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  tooltip?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={tooltip}
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
  const { isPending, startFilterTransition: startTransition } = useFilterTransition();
  const [techSearch, setTechSearch] = useState("");

  const [sections, setSections] = useState({
    workplace: true,
    seniority: true,
    tech:      true,
    /* Off by default — ATS source names (Greenhouse/Lever/...) are
     * backend-facing language most job seekers don't care about (#141).
     * Except when a source filter is already active (e.g. a shared link),
     * so it isn't hidden from the sidebar where the user could change it. */
    advanced:  params.has("source"),
  });

  /* Off by default — 8 flat seniority levels was too much (#145). Except
   * when the active filter is already one of the collapsed levels (e.g. a
   * shared link), so it isn't hidden from where the user could change it. */
  const [seniorityExpanded, setSeniorityExpanded] = useState(
    () => SENIORITY_MORE.some((o) => o.value === params.get("seniority")),
  );

  const initialTechs = (params.get("tech") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const [techCatOpen, setTechCatOpen] = useState<Record<string, boolean>>(() => {
    const activeCats = new Set(initialTechs.map(techCategory));
    return Object.fromEntries(TECH_CAT_ORDER.map((cat) => [cat, activeCats.has(cat)]));
  });

  function toggleTechCat(cat: string) {
    setTechCatOpen((s) => ({ ...s, [cat]: !s[cat] }));
  }

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

  function toggleTech(value: string) {
    const next = new URLSearchParams(params.toString());
    const current = (next.get("tech") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    const idx = current.indexOf(value);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(value);
    }
    if (current.length === 0) {
      next.delete("tech");
    } else {
      next.set("tech", current.join(","));
    }
    next.delete("page");
    startTransition(() => router.replace(`?${next.toString()}`));
  }

  function toggleSection(key: keyof typeof sections) {
    setSections((s) => ({ ...s, [key]: !s[key] }));
  }

  const currentTechs     = (params.get("tech") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const currentSource    = params.get("source")    ?? "";
  const currentRemote    = params.get("remote")    ?? "";
  const currentSeniority = params.get("seniority") ?? "";

  const filteredTechs = techOptions.filter((t) =>
    t.toLowerCase().includes(techSearch.toLowerCase())
  );

  const techsByCategory: Record<string, string[]> = {};
  for (const cat of TECH_CAT_ORDER) techsByCategory[cat] = [];
  for (const t of filteredTechs) techsByCategory[techCategory(t)].push(t);

  return (
    <aside
      className="flex flex-col gap-1"
      style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 120ms" }}
      aria-label="Job filters"
    >
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
                tooltip={"tooltip" in opt ? opt.tooltip : undefined}
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
            {SENIORITY_DEFAULT.filter((o) => (seniorityCounts[o.value] ?? 0) > 0).map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                count={seniorityCounts[opt.value]}
                active={currentSeniority === opt.value}
                onClick={() => toggle("seniority", opt.value)}
              />
            ))}
            {seniorityExpanded &&
              SENIORITY_MORE.filter((o) => (seniorityCounts[o.value] ?? 0) > 0).map((opt) => (
                <FilterChip
                  key={opt.value}
                  label={opt.label}
                  count={seniorityCounts[opt.value]}
                  active={currentSeniority === opt.value}
                  onClick={() => toggle("seniority", opt.value)}
                />
              ))}
            <button
              type="button"
              onClick={() => setSeniorityExpanded((v) => !v)}
              aria-expanded={seniorityExpanded}
              className="mt-0.5 self-start px-2.5 text-xs transition-colors"
              style={{ color: "var(--ink-mute)", fontSize: 11 }}
            >
              {seniorityExpanded ? "Show fewer" : "More levels"}
            </button>
          </div>
        )}
      </div>

      {/* Tech */}
      <div style={{ borderBottom: "1px solid var(--rule-soft)", paddingBottom: 8, marginBottom: 4 }}>
        <SectionHeader
          title="Technology"
          open={sections.tech}
          onToggle={() => toggleSection("tech")}
        />
        {sections.tech && (
          <div className="mt-1 flex flex-col gap-0.5">
            <input
              type="text"
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
            {techSearch ? (
              <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                {filteredTechs.slice(0, 60).map((t) => (
                  <FilterChip
                    key={t}
                    label={t}
                    active={currentTechs.includes(t)}
                    onClick={() => toggleTech(t)}
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
            ) : (
              <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
                {TECH_CAT_ORDER.filter((cat) => techsByCategory[cat].length > 0).map((cat) => (
                  <div key={cat}>
                    <button
                      onClick={() => toggleTechCat(cat)}
                      aria-expanded={techCatOpen[cat]}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left transition-colors"
                      style={{ color: "var(--ink-mute)" }}
                    >
                      <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {techCatLabel(cat)}
                      </span>
                      <span className="tabular" style={{ fontSize: 9, fontFamily: "var(--font-mono)" }}>
                        {techsByCategory[cat].length}
                      </span>
                    </button>
                    {techCatOpen[cat] && (
                      <div className="flex flex-col gap-0.5 pl-1">
                        {techsByCategory[cat].map((t) => (
                          <FilterChip
                            key={t}
                            label={t}
                            active={currentTechs.includes(t)}
                            onClick={() => toggleTech(t)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Advanced — source (ATS) filter. Off by default: Greenhouse / Lever /
       * Workable / Workday is backend-facing language most job seekers
       * don't care about (#141). */}
      <div>
        <SectionHeader
          title="Advanced"
          open={sections.advanced}
          onToggle={() => toggleSection("advanced")}
        />
        {sections.advanced && (
          <div className="mt-1 flex flex-col gap-0.5">
            <p
              className="px-2.5 py-0.5 text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--ink-mute)", fontSize: 9.5 }}
            >
              Source
            </p>
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
    </aside>
  );
}
