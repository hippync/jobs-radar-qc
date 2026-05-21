interface KpiStripProps {
  activeRoles: number;
  newToday: number;
  companies: number;
  remotePercent: number;
  hasFilters: boolean;
}

interface CardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}

function KpiCard({ label, value, sub, accent }: CardProps) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-md px-3 py-2.5"
      style={{
        background: accent ? "var(--accent-12)" : "var(--bg-2)",
        border: `1px solid ${accent ? "var(--accent)" : "var(--rule-soft)"}`,
        minWidth: 0,
        flex: "1 1 0",
      }}
    >
      <span
        className="text-xs uppercase tracking-wide"
        style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em" }}
      >
        {label}
      </span>
      <span
        className="text-xl font-semibold leading-none tabular"
        style={{ color: accent ? "var(--accent)" : "var(--ink)", fontFamily: "var(--font-mono)" }}
      >
        {value}
      </span>
      {sub && (
        <span
          className="text-xs"
          style={{ color: accent ? "var(--accent)" : "var(--ink-soft)", fontFamily: "var(--font-mono)", fontSize: 10 }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

export default function KpiStrip({
  activeRoles,
  newToday,
  companies,
  remotePercent,
  hasFilters,
}: KpiStripProps) {
  return (
    <div className="flex items-stretch gap-2">
      {/* Desktop: 4 cards. Mobile: first 3 only (hidden via CSS) */}
      <KpiCard
        label="active"
        value={activeRoles}
        sub={hasFilters ? "matching" : "roles"}
      />
      <KpiCard
        label="new today"
        value={newToday}
        sub="last 24 h"
      />
      <KpiCard
        label="companies"
        value={companies}
        sub="tracked"
      />
      {/* Hidden on mobile — not critical at small screen */}
      <div className="hidden sm:block" style={{ flex: "1 1 0" }}>
        <KpiCard
          label="remote / hybrid"
          value={`${remotePercent}%`}
          sub="of active roles"
        />
      </div>
    </div>
  );
}
