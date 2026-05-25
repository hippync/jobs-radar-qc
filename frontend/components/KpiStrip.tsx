interface KpiStripProps {
  activeRoles: number;
  newToday: number;
  companies: number;
  remotePercent: number;
  hasFilters: boolean;
  lastUpdated?: string | null;
}

/** Converts an ISO timestamp to a human-readable relative string, server-side.
 *  Returns the formatted text and whether the timestamp is considered stale (> 25h). */
function formatRelativeTime(isoString: string): { text: string; stale: boolean } {
  const diffMs      = Date.now() - new Date(isoString).getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours   = Math.floor(diffMs / 3_600_000);
  const diffDays    = Math.floor(diffMs / 86_400_000);

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  let text: string;
  if (diffMinutes < 60) {
    text = rtf.format(-diffMinutes, "minute");
  } else if (diffHours < 24) {
    text = rtf.format(-diffHours, "hour");
  } else {
    text = rtf.format(-diffDays, "day");
  }

  return { text, stale: diffHours >= 25 };
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
  lastUpdated,
}: KpiStripProps) {
  const freshness = lastUpdated ? formatRelativeTime(lastUpdated) : null;

  return (
    <div>
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

      {/* Freshness indicator — shown below the KPI row */}
      {freshness && (
        <div
          className="mt-1.5 flex items-center gap-1.5"
          style={{
            color: freshness.stale ? "#d97706" : "var(--ink-mute)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
          }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: freshness.stale ? "#d97706" : "#22c55e",
              flexShrink: 0,
            }}
          />
          <span>
            {freshness.stale ? "Last updated" : "Updated"} {freshness.text}
            {freshness.stale && " · pipeline may be delayed"}
          </span>
        </div>
      )}
    </div>
  );
}
