"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { addAlert, type AlertCadence, type AlertChannel } from "@/lib/alertsStore";

const SENIORITY_LABEL: Record<string, string> = {
  internship: "Intern",
  junior: "Junior",
  senior: "Senior",
  lead: "Lead",
  staff: "Staff",
  principal: "Principal",
  manager: "Manager",
  director: "Director",
};

const WORKPLACE_LABEL: Record<string, string> = {
  true: "Remote",
  false: "On-site",
  null: "Hybride / Non spécifié",
};

const CADENCE_OPTIONS: { value: AlertCadence; label: string }[] = [
  { value: "instant", label: "Instant" },
  { value: "daily_09", label: "Daily · 09:00" },
  { value: "weekly_mon", label: "Weekly · Mon" },
];

function buildName(params: URLSearchParams): string {
  const parts: string[] = [];
  const seniority = params.get("seniority");
  if (seniority && SENIORITY_LABEL[seniority]) parts.push(SENIORITY_LABEL[seniority]);
  const tech = params.get("tech");
  if (tech) parts.push(tech.split(",").map((t) => t.trim()).filter(Boolean).join("/"));
  const remote = params.get("remote");
  if (remote && WORKPLACE_LABEL[remote]) parts.push(WORKPLACE_LABEL[remote]);
  return parts.length > 0 ? parts.join(" · ") : "All roles";
}

function buildSummary(params: URLSearchParams): string {
  const bits: string[] = [];
  const tech = params.get("tech");
  if (tech) bits.push(`tech: ${tech.split(",").map((t) => t.trim()).join(", ")}`);
  const seniority = params.get("seniority");
  if (seniority && SENIORITY_LABEL[seniority]) bits.push(`seniority: ${SENIORITY_LABEL[seniority]}`);
  const remote = params.get("remote");
  if (remote && WORKPLACE_LABEL[remote]) bits.push(`workplace: ${WORKPLACE_LABEL[remote]}`);
  const source = params.get("source");
  if (source) bits.push(`source: ${source}`);
  return bits.length > 0 ? bits.join(" · ") : "No active filters — matches all roles";
}

interface Props {
  /**
   * "sidebar-cta"  — homepage desktop sidebar dashed-box CTA
   * "saved-button" — /saved "+ Add alert" pill button
   */
  variant: "sidebar-cta" | "saved-button";
}

export default function AlertRuleEditor({ variant }: Props) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<AlertCadence>("instant");
  const [channel, setChannel] = useState<AlertChannel>("email");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const query = searchParams.toString();
  const summary = buildSummary(searchParams);

  const openModal = useCallback(() => {
    setName(buildName(searchParams));
    setChannel("email");
    setTarget("");
    setError(null);
    setOpen(true);
  }, [searchParams]);

  const closeModal = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => nameInputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [open, closeModal]);

  function handleSave() {
    const trimmedName = name.trim();
    const trimmedTarget = target.trim();

    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (!trimmedTarget) {
      setError(channel === "email" ? "Email address is required." : "Slack webhook URL is required.");
      return;
    }
    if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedTarget)) {
      setError("Enter a valid email address.");
      return;
    }
    if (channel === "slack" && !/^https:\/\//.test(trimmedTarget)) {
      setError("Slack webhook URL must start with https://");
      return;
    }

    addAlert({
      name: trimmedName,
      query,
      cron: cadence,
      channel,
      channelTarget: trimmedTarget,
    });
    setOpen(false);
  }

  return (
    <>
      {variant === "sidebar-cta" ? (
        <button
          type="button"
          onClick={openModal}
          className="mt-6 block w-full rounded-md px-3 py-3 text-left text-xs"
          style={{
            border: "1.5px dashed var(--accent)",
            color: "var(--accent)",
            background: "var(--accent-12)",
            cursor: "pointer",
          }}
        >
          <p className="font-semibold" style={{ fontSize: 11 }}>★ Save as alert</p>
          <p className="mt-0.5" style={{ color: "var(--ink-soft)", fontSize: 10 }}>
            Get notified when new roles match this search.
          </p>
        </button>
      ) : (
        <button
          type="button"
          onClick={openModal}
          style={{
            padding: "4px 14px",
            fontSize: 12,
            fontWeight: 500,
            background: "var(--accent)",
            color: "var(--on-accent)",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            minHeight: 30,
            whiteSpace: "nowrap",
          }}
        >
          + Add alert
        </button>
      )}

      {open && createPortal(
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(29, 27, 24, 0.45)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "clamp(48px, 10vh, 120px)",
            paddingLeft: 16,
            paddingRight: 16,
          }}
          onClick={closeModal}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Save as alert"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              background: "var(--surface)",
              border: "1px solid var(--rule-soft)",
              borderRadius: 8,
              boxShadow: "0 8px 32px rgba(29,27,24,0.18)",
              padding: 20,
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
              Save as alert
            </p>
            <p style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 4, marginBottom: 16 }}>
              Get notified when new roles match this search.
            </p>

            {/* Name */}
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 4 }}>
              Name
              <input
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 4,
                  padding: "6px 8px",
                  fontSize: 13,
                  fontWeight: 400,
                  color: "var(--ink)",
                  background: "var(--bg-2)",
                  border: "1px solid var(--rule-soft)",
                  borderRadius: 6,
                }}
              />
            </label>

            {/* Query summary (read-only) */}
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-soft)", marginTop: 12, marginBottom: 4 }}>
              Query
            </p>
            <p
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--ink-mute)",
                background: "var(--bg-2)",
                border: "1px solid var(--rule-soft)",
                borderRadius: 6,
                padding: "6px 8px",
                margin: 0,
              }}
            >
              {summary}
            </p>

            {/* Cadence */}
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-soft)", marginTop: 12, marginBottom: 4 }}>
              Cadence
            </p>
            <div role="radiogroup" aria-label="Cadence" style={{ display: "flex", gap: 6 }}>
              {CADENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={cadence === opt.value}
                  onClick={() => setCadence(opt.value)}
                  style={{
                    flex: 1,
                    padding: "5px 8px",
                    fontSize: 11,
                    fontWeight: 500,
                    color: cadence === opt.value ? "var(--on-accent)" : "var(--ink-soft)",
                    background: cadence === opt.value ? "var(--accent)" : "var(--bg-2)",
                    border: "1px solid " + (cadence === opt.value ? "var(--accent)" : "var(--rule-soft)"),
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Delivery */}
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-soft)", marginTop: 12, marginBottom: 4 }}>
              Delivery
            </p>
            <div role="radiogroup" aria-label="Delivery channel" style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              {(["email", "slack"] as AlertChannel[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={channel === c}
                  onClick={() => setChannel(c)}
                  style={{
                    flex: 1,
                    padding: "5px 8px",
                    fontSize: 11,
                    fontWeight: 500,
                    color: channel === c ? "var(--on-accent)" : "var(--ink-soft)",
                    background: channel === c ? "var(--accent)" : "var(--bg-2)",
                    border: "1px solid " + (channel === c ? "var(--accent)" : "var(--rule-soft)"),
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  {c === "email" ? "Email" : "Slack webhook"}
                </button>
              ))}
            </div>
            <input
              type={channel === "email" ? "email" : "url"}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={channel === "email" ? "you@example.com" : "https://hooks.slack.com/..."}
              aria-label={channel === "email" ? "Email address" : "Slack webhook URL"}
              style={{
                display: "block",
                width: "100%",
                padding: "6px 8px",
                fontSize: 13,
                color: "var(--ink)",
                background: "var(--bg-2)",
                border: "1px solid var(--rule-soft)",
                borderRadius: 6,
              }}
            />

            {error && (
              <p role="alert" style={{ fontSize: 11, color: "var(--warning)", marginTop: 10, marginBottom: 0 }}>
                {error}
              </p>
            )}

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button
                type="button"
                onClick={closeModal}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--ink-soft)",
                  background: "transparent",
                  border: "1px solid var(--rule-soft)",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--on-accent)",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Save alert
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
