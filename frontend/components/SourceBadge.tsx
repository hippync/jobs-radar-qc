const SOURCE: Record<string, { label: string; short: string }> = {
  greenhouse: { label: "Greenhouse", short: "GH" },
  lever:      { label: "Lever",      short: "LV" },
  workable:   { label: "Workable",   short: "WK" },
};

export default function SourceBadge({ source }: { source: string }) {
  const s = SOURCE[source];
  if (!s) {
    return (
      <span
        className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
        style={{ background: "var(--bg-2)", color: "var(--ink-soft)", border: "1px solid var(--rule-soft)", fontFamily: "var(--font-mono)" }}
      >
        {source}
      </span>
    );
  }

  const bg = `var(--${source.slice(0, 2)}-bg)`;
  const fg = `var(--${source.slice(0, 2)}-fg)`;

  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold"
      style={{ background: bg, color: fg, borderRadius: 3, fontFamily: "var(--font-mono)" }}
      aria-label={s.label}
      title={s.label}
    >
      <span aria-hidden>{s.short}·</span>
      {s.label}
    </span>
  );
}
