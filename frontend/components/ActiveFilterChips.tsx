"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

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

const WORKPLACE_LABEL: Record<string, string> = {
  true:  "Remote",
  null:  "Hybride / Non spécifié",
  false: "On-site",
};

interface Chip {
  key: string;
  label: string;
}

export default function ActiveFilterChips() {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const chips: Chip[] = [];

  const tech      = params.get("tech");
  const source    = params.get("source");
  const remote    = params.get("remote");
  const seniority = params.get("seniority");

  const techs = tech ? tech.split(",").map((t) => t.trim()).filter(Boolean) : [];
  techs.forEach((t) => chips.push({ key: `tech:${t}`, label: t }));
  if (source)    chips.push({ key: "source",    label: source.charAt(0).toUpperCase() + source.slice(1) });
  if (remote)    chips.push({ key: "remote",    label: WORKPLACE_LABEL[remote] ?? remote });
  if (seniority) chips.push({ key: "seniority", label: SENIORITY_LABEL[seniority] ?? seniority });

  if (chips.length === 0) return null;

  function remove(key: string) {
    const next = new URLSearchParams(params.toString());
    if (key.startsWith("tech:")) {
      const techToRemove = key.slice(5);
      const current = (next.get("tech") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
      const updated = current.filter((t) => t !== techToRemove);
      if (updated.length === 0) {
        next.delete("tech");
      } else {
        next.set("tech", updated.join(","));
      }
    } else {
      next.delete(key);
    }
    next.delete("page");
    startTransition(() => router.replace(`?${next.toString()}`));
  }

  function clearAll() {
    startTransition(() => router.replace("/"));
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 120ms" }}
      aria-label="Active filters"
    >
      {chips.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => remove(key)}
          aria-label={`Remove ${label} filter`}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all"
          style={{
            background: "var(--accent-12)",
            color: "var(--accent)",
            border: "1px solid var(--accent)",
            fontSize: 11,
            transition: "all 240ms ease-out",
          }}
        >
          {label}
          <span aria-hidden style={{ fontSize: 12, lineHeight: 1, opacity: 0.8 }}>×</span>
        </button>
      ))}

      <button
        onClick={clearAll}
        className="ml-1 text-xs transition-colors"
        style={{ color: "var(--ink-mute)", fontSize: 11 }}
      >
        Clear all
      </button>
    </div>
  );
}
