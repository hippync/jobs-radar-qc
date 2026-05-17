const SOURCE_STYLE: Record<string, { label: string; cls: string }> = {
  greenhouse: {
    label: "Greenhouse",
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  lever: {
    label: "Lever",
    cls: "bg-blue-50 text-blue-700 ring-blue-200",
  },
  workable: {
    label: "Workable",
    cls: "bg-orange-50 text-orange-700 ring-orange-200",
  },
};

export default function SourceBadge({ source }: { source: string }) {
  const style = SOURCE_STYLE[source] ?? {
    label: source,
    cls: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ring-1 ${style.cls}`}
    >
      {style.label}
    </span>
  );
}
