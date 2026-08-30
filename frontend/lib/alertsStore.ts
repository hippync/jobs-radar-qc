"use client";

import { useSyncExternalStore } from "react";
import type { Job } from "@/lib/types";

/* ── Types ─────────────────────────────────────────────────────────────── */
export type AlertCadence = "instant" | "daily_09" | "weekly_mon";
export type AlertChannel = "email" | "slack";

export interface SavedFilter {
  id: string;
  name: string;
  /** URLSearchParams string, e.g. "tech=Go,Python&seniority=senior" */
  query: string;
  cron: AlertCadence;
  channel: AlertChannel;
  channelTarget: string;
  unreadCount: number;
  enabled: boolean;
}

/* ── Storage keys ─────────────────────────────────────────────────────── */
const STORAGE_KEY = "jobs-radar-qc:alerts";

/*
 * Custom DOM event used to notify useSyncExternalStore subscribers when
 * localStorage changes within the same tab. The native "storage" event only
 * fires for changes from other tabs — same convention as SaveButton.tsx /
 * SavedPageClient.tsx.
 */
const ALERTS_CHANGE = "jobs-radar-qc:alerts-change";

/** Stable empty array returned by getServerSnapshot for the alerts list. */
const SERVER_ALERTS: SavedFilter[] = [];

let _raw: string | null = null;
let _cache: SavedFilter[] = [];

/* ── localStorage helpers ─────────────────────────────────────────────── */
function loadAlerts(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === _raw) return _cache; // stable ref — no re-render
    _raw = raw;
    _cache = raw ? (JSON.parse(raw) as SavedFilter[]) : [];
    return _cache;
  } catch {
    _raw = null;
    _cache = [];
    return _cache;
  }
}

function persistAlerts(next: SavedFilter[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    _raw = null; // force reparse on next read, including in this tab
    window.dispatchEvent(new Event(ALERTS_CHANGE));
  } catch {}
}

function subscribeAlerts(cb: () => void): () => void {
  window.addEventListener(ALERTS_CHANGE, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(ALERTS_CHANGE, cb);
    window.removeEventListener("storage", cb);
  };
}

function getServerAlerts(): SavedFilter[] {
  return SERVER_ALERTS;
}

/* ── Public hook ──────────────────────────────────────────────────────── */
export function useAlerts(): SavedFilter[] {
  return useSyncExternalStore(subscribeAlerts, loadAlerts, getServerAlerts);
}

/* ── Mutators ─────────────────────────────────────────────────────────── */
export function addAlert(input: Omit<SavedFilter, "id" | "unreadCount" | "enabled">): SavedFilter {
  const alert: SavedFilter = {
    ...input,
    id: crypto.randomUUID(),
    unreadCount: 0,
    enabled: true,
  };
  persistAlerts([...loadAlerts(), alert]);
  return alert;
}

export function removeAlert(id: string) {
  persistAlerts(loadAlerts().filter((a) => a.id !== id));
}

export function toggleAlert(id: string) {
  persistAlerts(loadAlerts().map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
}

/* ── Matching ─────────────────────────────────────────────────────────────
 * Compares a job against a saved alert's stored query string. Fields present
 * in the query must ALL match (AND); a multi-value "tech" field matches if
 * ANY listed tech is present on the job (OR) — mirroring how the tech filter
 * itself narrows results elsewhere in the app.
 * An empty query never matches, so a filterless alert doesn't light up every
 * card.
 * ─────────────────────────────────────────────────────────────────────── */
export function matchesAlert(job: Job, alert: SavedFilter): boolean {
  if (!alert.query) return false;
  const params = new URLSearchParams(alert.query);

  const tech = params.get("tech");
  if (tech) {
    const wanted = tech.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    const has = job.tech_stack.some((t) => wanted.includes(t.toLowerCase()));
    if (!has) return false;
  }

  const seniority = params.get("seniority");
  if (seniority && job.seniority !== seniority) return false;

  const source = params.get("source");
  if (source && job.source !== source) return false;

  const remote = params.get("remote");
  if (remote) {
    const wanted = remote === "true" ? true : remote === "false" ? false : null;
    if (job.is_remote !== wanted) return false;
  }

  return true;
}
