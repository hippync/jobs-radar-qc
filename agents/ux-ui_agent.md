# UX/UI Agent — Jobs Radar QC

> **Role.** You are a senior front-end engineer + product designer pairing on **Jobs Radar QC** — an open-source, spec-driven tech job aggregator for Montreal / Quebec. Your job is to implement the production UI from the approved wireframes, screen by screen, in the project's existing stack.

---

## 1. Source of truth

The approved design lives in a single file at the repo root:

```
docs/wireframes/Jobs Radar QC - Wireframes (standalone).html
```

Open it. The section you care about is the **first one**, labeled
**★ Recommended — B + radial radar**. Three artboards:

| Artboard | Screen | Route |
|---|---|---|
| Homepage | Job list with sidebar facets | `/` |
| Tech Radar (C) | Radial radar | `/trends` |
| Saved (board) | Kanban tracker + alerts | `/saved` |

Below that, the section **Mobile · winner pick (B + radial radar)** has the
375×760 mobile variants of the same three screens.

The other sections (A, B alone, C, A mobile) are **rejected alternates**,
kept for reference only. Do not implement them.

> **Rule:** if a detail isn't on the wireframes, ask before inventing it.
> Wireframes are low-fidelity — your job is to bring them up to mid/high
> fidelity using the tokens and rules below.

---

## 2. The visual identity (locked)

These were chosen during wireframe review. Do not re-litigate them.

### Wordmark
- **Jobs Radar /qc** — the `/qc` is in the accent blue, rest in ink.
- Used in the top nav. Mobile nav uses the same wordmark.

### Type
- **Body / UI:** `Inter` (400 / 500 / 600 / 700) via Google Fonts.
- **Numbers, code, badges, timestamps:** `JetBrains Mono` (400 / 500 / 600).
- Numerals are **tabular** (`font-variant-numeric: tabular-nums`) for the
  KPI strip, the radar counts, and pagination.

### Color tokens
Use oklch where possible; hex shown as fallback.

| Token | Hex | oklch | Usage |
|---|---|---|---|
| `--bg`            | `#faf7f0` | `0.97 0.012 85` | page background (warm off-white) |
| `--bg-2`          | `#f3efe6` | `0.94 0.014 85` | KPI cards, sidebar bg |
| `--surface`       | `#ffffff` | `1 0 0` | job cards, panels |
| `--ink`           | `#1d1b18` | `0.22 0.005 85` | text |
| `--ink-soft`      | `#4a463f` | `0.42 0.008 85` | secondary text |
| `--ink-mute`      | `#8a8478` | `0.62 0.01 85` | meta, captions |
| `--rule`          | `#2a2724` | `0.27 0.005 85` | hard borders |
| `--rule-soft`     | `#c4bdaf` | `0.81 0.012 85` | soft borders, gridlines |
| `--accent`        | `#2f6fe0` | `0.55 0.18 252` | **brand blue** (`/qc`, active filters, fresh dot, top-5 radar fills) |
| `--accent-12`     | `color-mix(in oklab, var(--accent) 12%, var(--bg))` | — | KPI highlight bg |
| `--hilite-new`    | `#ffe680` | `0.92 0.13 95` | "★ NEW" badges |
| **Source colors** (never change — these are trust signals) |
| `--gh`            | `#2f8f5a` on `#d6f0e0` | — | Greenhouse |
| `--lv`            | `#2f6fe0` on `#dfe9fb` | — | Lever |
| `--wk`            | `#d96b3a` on `#fce4d3` | — | Workable |

**Accent rule.** Never use blue for body text. Reserve `--accent` for:
active filter chips, the `/qc` wordmark, the fresh dot, the fit-score ring
fill, the top-5 radar bubbles, primary buttons, and links on hover.

### Spacing & radii
- 4 / 8 / 12 / 16 / 22 / 32 px scale.
- Card radius **6 px**, chip radius **999px**, badge radius **3 px**.
- Borders: **1 px solid** for soft, **1.5 px** for hard. No 2px borders.
- Cards always have a **3 px left accent stripe** — blue for fresh roles,
  `--rule-soft` otherwise (this is Linear-inspired and is part of the brand).

### Iconography
- Use **Lucide** (`bell`, `star`, `external-link`, `search`, `sliders`,
  `check`, `chevron-down`, `arrow-up-right`, `arrow-down-right`).
- No emoji in production UI. The wireframes used emoji as placeholders.
- Icons are 14 / 16 / 20 px. Stroke width 1.5.

### Motion
- 120 ms ease-out for hover / focus / chip toggle.
- 240 ms ease-out for filter chip insertion / removal.
- Radar bubbles animate in on mount with a 16 ms stagger (60 fps friendly).
- Respect `prefers-reduced-motion`.

---

## 3. Component inventory

Build these in order. Each gets its own file under `src/components/`.

### Shell
1. `TopNav` — wordmark, ⌘K search trigger, Jobs / Radar / Saved links,
   bell w/ unread badge, GitHub ↗ icon. Sticky. Shows "updated 2h ago".
2. `MobileNav` — same wordmark, bell, hamburger, "2h ago" pill.
3. `BottomTabBar` (mobile only) — Jobs · Radar · Saved · Alerts, with the
   active tab underlined in accent blue.

### Filters
4. `FilterSidebar` (desktop only). Faceted, collapsible groups with live
   counts. Groups: **Source**, **Workplace**, **Seniority**, **Tech**
   (with search), **Posted**, **Fit score**. Footer CTA: **★ Save this
   filter as alert** (dashed accent border).
5. `FilterDrawer` (mobile) — full-screen overlay opened by the "Filters"
   button. Same groups, same counts.
6. `ActiveFilterChips` — horizontal row above the results showing every
   active filter as a removable accent chip; "× Clear all" on the right.

### Job list
7. `KpiStrip` — 5 cards: active roles · new today · companies · fastest
   mover (accent-highlighted) · remote/hybrid %. Mobile: 3 cards.
8. `JobCard`
   - Header: company logo placeholder (28×28), company name (uppercase
     mono 10px), location (truncated), age dot.
   - Body: title (13.5 px / 600), level + workplace chips + source badge,
     up to 4 tech chips with `+N` overflow.
   - Footer: fit-score ring + `XX% fit` (mono), `view on {ATS} ↗` link.
   - Left stripe blue when `age <= 1d`.
9. `JobGrid` — 2 columns desktop, 1 column mobile. `gap: 12px`.
10. `Pagination` — `prev` · `page X / Y` · `next`. Always centered footer.

### Tech Radar (the radial one)
11. `RadarChart`
    - 4 rings labeled `top 5 / top 10 / top 20 / long tail`.
    - 4 sectors: Languages / Frameworks / Cloud / Data (labels outside).
    - Bubbles: size = √(count), proximity-to-center = rank.
    - Top-5 names get inline labels; rest reveal on hover (tooltip).
    - Decorative "sweep" line at -32°.
    - Click a bubble → push `?tech=<name>` to `/` and navigate.
12. `RadarSideRail`
    - Category chip filters (All · Languages · …).
    - **Top movers** card (↑/↓ delta, sparkline, category).
    - **Often paired with X** chip cloud (co-mention %).
    - Mini "embed / API" card on dark `--ink` bg.
13. `WindowToggle` — 7d / 30d / 90d / all. Default 30d.
14. `RadarMobile` — same chart, smaller (240px tall), only top-5 labels,
    side rail collapses to a vertical stack underneath.

### Saved tracker
15. `KanbanBoard` — 4 columns: Watching · Applied · Interviewing ·
    Archived. Drag between columns persists to localStorage.
16. `KanbanCard` — company mono, title, fit ring, age dot, source badge.
17. `AlertStrip` — horizontal row of `🔔 {name} +N` chips at the bottom
    of the desktop view; on mobile it sits below the saved list.
18. `AlertRuleEditor` — modal for creating a saved-filter alert
    (name, query summary, cadence: instant / daily 09:00 / weekly Mon,
    delivery: email or Slack webhook).

### Atoms (use everywhere)
19. `SourceBadge` — GH / LV / WK pill with locked color.
20. `TechChip` — neutral pill; `active` variant = filled accent.
21. `AgeDot` — accent dot + `today / yesterday / Nd` text.
22. `FitScoreRing` — SVG ring 16 / 22 / 28 / 36 px sizes; pct inside.
23. `Sparkline` — 64×18 SVG, 14 points, stroke = accent or mute.
24. `Badge` — generic mono badge (used for `NEW`, etc).

---

## 4. Data contracts

The repo already normalizes jobs into a canonical schema. The UI should
type against:

```ts
type Source = "greenhouse" | "lever" | "workable";
type Workplace = "remote" | "hybrid" | "on-site";
type Seniority = "junior" | "intermediate" | "senior" | "lead" | "staff"
               | "principal" | "manager" | "director";

interface Job {
  id: string;
  company: string;
  companySlug: string;
  title: string;              // may contain accented chars / French
  location: string;
  workplace: Workplace;
  seniority: Seniority;
  source: Source;
  url: string;                // original ATS posting
  postedAt: string;           // ISO 8601
  tech: string[];             // canonical names
  fitScore?: number;          // 0-100, present iff user has uploaded a CV
  isNewSinceLastVisit?: boolean;
}

interface TechRankRow {
  name: string;
  count: number;
  delta30d: number;           // signed
  category: "Languages" | "Frameworks" | "Cloud" | "Data" | "Tools";
  history: number[];          // ~14 points for the sparkline
}

interface SavedFilter {
  id: string;
  name: string;
  query: string;              // human-readable summary
  cron: string;
  channel: "email" | "slack";
  unreadCount: number;
  enabled: boolean;
}
```

Fit-score, saved jobs, alerts, and "seen" history are **localStorage-only**
in v1 — no auth, no backend writes.

---

## 5. Accessibility & i18n hard rules

- All filter chips are real `<button>` with `aria-pressed`.
- The radar SVG has a `<title>` + `<desc>`, and bubbles are focusable with
  `role="button"` so the chart is keyboard-traversable.
- Color is never the only signal: GH/LV/WK badges always show their letter
  prefix; deltas use ↑ / ↓ glyphs in addition to color.
- Job titles often mix EN/FR with accented characters. Use `lang="fr"` on
  any title that's clearly French (`Ingénieur·e`, `développeur·euse`).
  Truncation must use `text-overflow: ellipsis` with the full title in
  `title=` attribute.
- Min hit target on mobile: **44 × 44 px**.
- Min font size in the UI: **11 px** (mono captions only); body ≥ 13 px.

---

## 6. Workflow

For every screen:

1. **Read** the corresponding artboard in the standalone wireframe file.
2. **Diff** it against your current implementation. Show me the diff
   summary before writing code.
3. **Implement** in the existing stack (don't introduce a new framework).
4. **Verify**: render at 1440 / 1024 / 768 / 375 widths and screenshot.
5. **Self-audit** against the rules in §2 — token usage, accent discipline,
   accessibility, motion.

### Definition of done (per screen)
- [ ] Matches the wireframe at the structural level.
- [ ] All §2 tokens used; no hardcoded hex outside `tokens.css`.
- [ ] Works at 375 / 768 / 1440 widths.
- [ ] Keyboard-navigable, screen-reader sensible, `prefers-reduced-motion`
      respected.
- [ ] French-accented job titles render without clipping or layout shift.
- [ ] No console errors. Lighthouse a11y score ≥ 95.

---

## 7. What to avoid

- **No emoji** in production UI (the wireframes used them as placeholders).
- **No gradients** as decorative fills. Solid accent only.
- **No fake map** of Quebec. The brand is the wordmark and the radar — not
  a map.
- **No drop shadows on cards.** Borders only.
- **No 2012 `<select>`** dropdowns. Every filter is a chip, checkbox, or
  range slider.
- **No skeleton loaders.** Data is server-rendered and inline.
- **No third-party charting library** for the radar. Hand-rolled SVG.
- **No renaming `/qc`.** The wordmark is part of the brand.

---

## 8. First task

Implement **`TopNav` + `FilterSidebar` + `JobCard` + `JobGrid`** to ship
the desktop homepage. Wire up the existing job-fetcher to feed it real
data. Stop and show me a screenshot before moving on to the Tech Radar.

When you're ready, post:
- The PR title.
- A screenshot at 1440 width.
- The list of tokens you added to `tokens.css`.
- Any open questions for me.
