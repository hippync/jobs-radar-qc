/**
 * radarHelpers.ts — shared pure helpers for the Tech Stack Radar
 *
 * CANONICAL mirrors the tech lists in core/canonical_tech_stack.json
 * (version 2) exactly, category by category — every tech in the JSON
 * must appear here, or it silently vanishes from the /trends radar chart
 * (RadarChartClient only builds sector buckets for selected categories;
 * anything classified "other" is never selectable and never rendered).
 *
 * One intentional deviation: core's "data_ai" category is called "data"
 * here, and everywhere else in the frontend (the --cat-data CSS token,
 * the ?cats=data URL param, SEGMENT_DEFAULT_CATS). That rename predates
 * this file and is already load-bearing in shipped UI and shareable
 * /trends links, so it's kept rather than reverted to match core's key
 * name — only the tech *lists* need to match, not the slug string.
 *
 * If the canonical JSON is bumped, update CANONICAL below and
 * the ALL_CAT_SLUGS / CATEGORY_LABELS constants accordingly.
 */

/** A single ranked technology entry returned by fetchRadarData. */
export interface TechRow {
  name: string;
  count: number;
  rank: number;
  /** Canonical category slug (e.g. "languages", "devops"). */
  category: string;
}

export interface CanonicalStack {
  version: string;
  categories: Record<string, string[]>;
}

/** All 10 canonical category slugs, in display order. */
export const ALL_CAT_SLUGS = [
  "languages",
  "frontend",
  "backend",
  "databases",
  "cloud",
  "devops",
  "data",
  "mobile",
  "testing",
  "ai_concepts",
] as const;

export type CatSlug = (typeof ALL_CAT_SLUGS)[number];

/** Human-readable labels per canonical slug. */
export const CATEGORY_LABELS: Record<CatSlug, string> = {
  languages:   "Languages",
  frontend:    "Frontend",
  backend:     "Backend",
  databases:   "Databases",
  cloud:       "Cloud",
  devops:      "DevOps",
  data:        "Data",
  mobile:      "Mobile",
  testing:     "Testing",
  ai_concepts: "AI Concepts",
};

/**
 * CSS slug — convert underscore-separated slug to hyphen for CSS custom
 * property names. Example: "ai_concepts" → "ai-concepts".
 */
export function catToCssSlug(slug: string): string {
  return slug.replace(/_/g, "-");
}

/** Default radar sectors (shown when no ?cats= param is present). */
export const DEFAULT_CATS: readonly string[] = [
  "languages",
  "frontend",
  "devops",
  "data",
];

/** Pre-set radar sectors for each role segment, derived from segment classification rules. */
export const SEGMENT_DEFAULT_CATS: Record<string, readonly [CatSlug, CatSlug, CatSlug, CatSlug]> = {
  startup_saas:   ["frontend",  "backend",    "databases",  "languages"],
  enterprise:     ["languages", "backend",    "databases",  "cloud"],
  ai_ml:          ["data",      "ai_concepts","languages",  "cloud"],
  cloud_platform: ["cloud",     "devops",     "backend",    "databases"],
  consulting:     ["languages", "backend",    "frontend",   "databases"],
  fintech:        ["languages", "backend",    "databases",  "devops"],
  mobile:         ["mobile",    "languages",  "frontend",   "backend"],
};

/**
 * Inline canonical data — mirrors core/canonical_tech_stack.json v2.
 * Kept here so the frontend bundle is self-contained and the helpers
 * can be unit-tested without filesystem access.
 */
export const CANONICAL: CanonicalStack = {
  version: "2",
  categories: {
    languages: [
      "Python", "Java", "TypeScript", "JavaScript", "C#", "Go", "SQL",
      "Kotlin", "Swift", "Rust", "Ruby", "PHP", "Scala", "Dart", "R",
      "Elixir", "C++",
    ],
    frontend: [
      "React", "Next.js", "Angular", "Vue", "Tailwind", "Redux", "Svelte",
      "Vite", "tRPC", "Remix", "Storybook",
    ],
    backend: [
      "Spring Boot", "Node.js", "Express", "NestJS", ".NET",
      "Django", "FastAPI", "GraphQL", "REST", "gRPC",
      "Rails", "Laravel", "Flask", "ASP.NET", "Celery", "Gin",
    ],
    databases: [
      "PostgreSQL", "MySQL", "MongoDB", "Redis",
      "DynamoDB", "Snowflake", "Elasticsearch", "ClickHouse",
      "BigQuery", "Cassandra", "Firebase", "Supabase", "SQLite",
    ],
    cloud: [
      "AWS", "Azure", "GCP", "Linux", "Nginx", "Cloudflare",
      "Vercel", "DigitalOcean", "Heroku",
    ],
    devops: [
      "Docker", "Kubernetes", "Terraform", "Helm",
      "GitHub Actions", "Jenkins", "ArgoCD",
      "Prometheus", "Grafana", "Ansible",
      "GitLab CI", "CircleCI", "Pulumi", "Vault",
    ],
    // Named "data_ai" in core/canonical_tech_stack.json — see file header.
    data: [
      "Pandas", "Spark", "Databricks", "Airflow",
      "TensorFlow", "PyTorch", "LangChain", "OpenAI",
      "Vector DB", "dbt", "Kafka", "MLflow",
      "NumPy", "scikit-learn", "Hugging Face", "Flink", "RabbitMQ", "Weights & Biases",
    ],
    mobile: [
      "React Native", "Flutter", "SwiftUI", "Android", "iOS",
    ],
    testing: [
      "Jest", "Cypress", "Playwright", "Selenium", "JUnit", "Postman",
      "Vitest", "pytest", "Mocha", "RSpec",
    ],
    ai_concepts: [
      "LLM", "RAG", "AI Agents", "Prompt Engineering", "Fine-tuning",
      "Embeddings", "Semantic Search", "NLP", "Computer Vision", "GenAI",
    ],
  },
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Returns all tech names for a canonical category slug. */
export function getTechsForCategory(
  cat: string,
  canonical: CanonicalStack,
): string[] {
  return canonical.categories[cat] ?? [];
}

/**
 * Builds a map from tech name to human-readable sector label for the
 * given selected categories.
 *
 * Techs not in any selected category are absent from the map; callers
 * should treat a missing key as "outside selected sectors".
 */
export function buildSectorMap(
  selectedCats: string[],
  canonical: CanonicalStack,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const cat of selectedCats) {
    const label = CATEGORY_LABELS[cat as CatSlug] ?? cat;
    for (const tech of getTechsForCategory(cat, canonical)) {
      map[tech] = label;
    }
  }
  return map;
}

/**
 * Parse and validate the ?cats= URL parameter.
 *
 * Rules:
 * - Accepts only slugs that exist as keys in canonical.categories.
 * - Deduplicates: a slug appearing more than once is treated as one.
 * - Returns exactly 4 slugs.
 * - If more than 4 valid unique slugs are provided, the first 4 are used.
 * - If fewer than 4 valid slugs are provided (or raw is undefined/empty),
 *   missing slots are filled from `defaults` without introducing duplicates.
 * - Falls back entirely to defaults[0..3] when raw is missing or entirely
 *   invalid.
 */
export function parseCatsParam(
  raw: string | undefined,
  canonical: CanonicalStack,
  defaults: readonly string[],
): string[] {
  const validSlugs = new Set(Object.keys(canonical.categories));

  if (!raw || raw.trim() === "") {
    return defaults.slice(0, 4) as string[];
  }

  // Split, trim, lowercase, filter to valid canonical slugs, deduplicate.
  const seen = new Set<string>();
  const parsed: string[] = [];
  for (const part of raw.split(",")) {
    const slug = part.trim().toLowerCase();
    if (slug.length > 0 && validSlugs.has(slug) && !seen.has(slug)) {
      seen.add(slug);
      parsed.push(slug);
      if (parsed.length === 4) break;
    }
  }

  // Fill remaining slots from defaults without duplicates.
  if (parsed.length < 4) {
    for (const d of defaults) {
      if (parsed.length >= 4) break;
      if (!seen.has(d)) {
        seen.add(d);
        parsed.push(d);
      }
    }
  }

  return parsed;
}

/**
 * Build a reverse lookup: tech name → canonical category slug.
 * Techs not in the canonical return undefined.
 */
export function buildTechToCatMap(
  canonical: CanonicalStack,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [cat, techs] of Object.entries(canonical.categories)) {
    for (const tech of techs) {
      map[tech] = cat;
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Standalone SVG rendering
// ---------------------------------------------------------------------------

/**
 * Hardcoded hex equivalents of the CSS custom properties.
 * CSS vars (--cat-*) cannot be resolved in standalone SVGs used as <img> or
 * embedded in GitHub READMEs. Values are derived from globals.css:
 *   oklch(0.55 0.18 <H>) converted to sRGB hex.
 */
export const CAT_COLORS: Record<string, string> = {
  languages:   "#4b73c4",  // oklch(0.55 0.18 252) — blue
  frontend:    "#1b9e79",  // oklch(0.55 0.18 160) — teal
  backend:     "#1b7d9e",  // oklch(0.55 0.18 200) — cyan
  databases:   "#7949cc",  // oklch(0.55 0.18 295) — violet
  cloud:       "#b89020",  // oklch(0.55 0.18  55) — amber
  devops:      "#cc6620",  // oklch(0.55 0.18  30) — orange
  data:        "#cc5245",  // oklch(0.55 0.18  20) — coral
  mobile:      "#cc3d70",  // oklch(0.55 0.18 330) — rose
  testing:     "#38a847",  // oklch(0.55 0.18 130) — green
  ai_concepts: "#849920",  // oklch(0.55 0.18  85) — lime
};

/** Escape a string for safe insertion into SVG text/attribute content. */
function escSvg(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Hex color palettes for the standalone SVG — no CSS variables available. */
const SVG_PALETTE = {
  dark: {
    bg:          "#0d1117",
    gridline:    "#21262d",
    ringLabel:   "#6e7681",
    divider:     "#21262d",
    leaderText:  "#c9d1d9",
    countText:   "#6e7681",
    bubbleStroke:"#21262d",
    legend:      "#6e7681",
    accent:      "#4b73c4",
  },
  light: {
    bg:          "#ffffff",
    gridline:    "#c4bdaf",
    ringLabel:   "#8a8478",
    divider:     "#c4bdaf",
    leaderText:  "#1d1b18",
    countText:   "#8a8478",
    bubbleStroke:"#c4bdaf",
    legend:      "#8a8478",
    accent:      "#2f6fe0",
  },
} as const;

/**
 * Render a standalone SVG string for the radar.
 *
 * Mirrors the RadarChart JSX component in trends/page.tsx but returns a
 * self-contained SVG string with hardcoded colors (no CSS variables) so
 * it can be embedded in a GitHub README or served via /api/radar?format=svg.
 *
 * viewBox: "0 0 560 480" · CX=280, CY=240, R=200 · 4 rings · 4 sectors
 */
export function renderRadarSvg(
  allTechs: TechRow[],
  selectedCats: string[],
  bg: "light" | "dark" = "dark",
): string {
  const P = SVG_PALETTE[bg];
  const CX = 280, CY = 240, R = 200;
  const RINGS = [0.95, 0.68, 0.42, 0.18];

  /* ── Group techs by sector, capped at 8 per sector ─────────────────── */
  const byCat: Record<string, TechRow[]> = {};
  for (const cat of selectedCats) byCat[cat] = [];
  for (const t of allTechs) {
    const arr = byCat[t.category];
    if (arr && arr.length < 8) arr.push(t);
  }

  /* ── One label per active sector: highest-count tech in each category ── */
  const CATEGORY_LEADERS = new Set(
    selectedCats.flatMap((cat) => {
      const leader = byCat[cat]?.[0];
      return leader ? [leader.name] : [];
    }),
  );

  /* ── Polar placement ────────────────────────────────────────────────── */
  interface Placed {
    tech: TechRow;
    x: number;
    y: number;
    size: number;
    isCategoryLeader: boolean;
    labelSide: "right" | "left";
    color: string;
  }

  const placed: Placed[] = [];
  selectedCats.forEach((cat, catIdx) => {
    const arr = byCat[cat] ?? [];
    const sectorAngle = (Math.PI * 2) / selectedCats.length;
    arr.forEach((tech, i) => {
      const angle =
        -Math.PI / 2 +
        catIdx * sectorAngle +
        (sectorAngle * (i + 1)) / (arr.length + 1);
      const rankFrac = tech.rank / Math.max(1, allTechs.length);
      const r = R * (0.16 + 0.76 * Math.min(1, rankFrac * 1.8));
      const x = CX + Math.cos(angle) * r;
      const y = CY + Math.sin(angle) * r;
      const size = Math.max(6, Math.min(20, Math.sqrt(tech.count) * 1.3));
      const isCategoryLeader = CATEGORY_LEADERS.has(tech.name);
      const labelSide: "right" | "left" = x > CX ? "right" : "left";
      const color = CAT_COLORS[cat] ?? "#888888";
      placed.push({ tech, x, y, size, isCategoryLeader, labelSide, color });
    });
  });

  /* ── Build SVG string ───────────────────────────────────────────────── */
  const n = (v: number, d = 1) => v.toFixed(d);
  const parts: string[] = [];

  parts.push(
    `<svg viewBox="0 0 560 480" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tech Stack Radar — Jobs Radar /qc">`,
  );
  parts.push(`<title>Tech Stack Radar — Jobs Radar /qc</title>`);
  parts.push(
    `<desc>Radial chart showing ${placed.length} technologies grouped into ${selectedCats.length} sectors: ` +
      `${selectedCats.map((c) => CATEGORY_LABELS[c as CatSlug] ?? c).join(", ")}. ` +
      `Bubble size represents posting count; proximity to center represents overall rank.</desc>`,
  );

  // Background
  parts.push(`<rect width="560" height="480" fill="${P.bg}"/>`);

  // Concentric rings
  for (let i = 0; i < RINGS.length; i++) {
    const k = RINGS[i];
    parts.push(
      `<circle cx="${CX}" cy="${CY}" r="${n(R * k, 1)}" fill="none" stroke="${P.gridline}" stroke-dasharray="3 5" stroke-width="1"/>`,
    );
  }

  // Sector divider lines
  selectedCats.forEach((_, i) => {
    const sectorAngle = (Math.PI * 2) / selectedCats.length;
    const a0 = -Math.PI / 2 + i * sectorAngle;
    parts.push(
      `<line x1="${CX}" y1="${CY}" x2="${n(CX + Math.cos(a0) * R)}" y2="${n(CY + Math.sin(a0) * R)}" stroke="${P.divider}" stroke-width="1"/>`,
    );
  });

  // Sector labels
  selectedCats.forEach((cat, i) => {
    const sectorAngle = (Math.PI * 2) / selectedCats.length;
    const am = -Math.PI / 2 + i * sectorAngle + sectorAngle / 2;
    const lx = CX + Math.cos(am) * (R + 26);
    const ly = CY + Math.sin(am) * (R + 26);
    const color = CAT_COLORS[cat] ?? "#888888";
    const label = CATEGORY_LABELS[cat as CatSlug] ?? cat;
    parts.push(
      `<text x="${n(lx)}" y="${n(ly)}" font-family="sans-serif" font-size="11" font-weight="600" text-anchor="middle" fill="${escSvg(color)}">${escSvg(label)}</text>`,
    );
  });

  // Decorative sweep line at -32°
  parts.push(
    `<line x1="${CX}" y1="${CY}" x2="${CX + R}" y2="${CY}" stroke="${P.accent}" stroke-width="1.25" stroke-dasharray="2 5" opacity="0.45" transform="rotate(-32 ${CX} ${CY})"/>`,
  );

  // Center dot + ring
  parts.push(`<circle cx="${CX}" cy="${CY}" r="5" fill="${P.accent}"/>`);
  parts.push(
    `<circle cx="${CX}" cy="${CY}" r="13" fill="none" stroke="${P.accent}" stroke-width="1"/>`,
  );

  // Bubbles
  for (const { tech, x, y, size, isCategoryLeader, labelSide, color } of placed) {
    // Category leader: solid fill; others: ~35% opacity (hex 59 ≈ 35% of 255)
    const fill = isCategoryLeader ? color : `${color}59`;
    const labelX = labelSide === "right" ? x + size + 4 : x - size - 4;
    const anchor = labelSide === "right" ? "start" : "end";
    parts.push(
      `<circle cx="${n(x)}" cy="${n(y)}" r="${n(size)}" fill="${escSvg(fill)}" stroke="${P.bubbleStroke}" stroke-width="1">` +
        `<title>${escSvg(tech.name)} — ${tech.count} roles (rank #${tech.rank})</title>` +
        `</circle>`,
    );
    if (isCategoryLeader) {
      parts.push(
        `<text x="${n(labelX)}" y="${n(y + 3)}" font-family="sans-serif" font-size="10.5" font-weight="600" text-anchor="${anchor}" fill="${P.leaderText}">${escSvg(tech.name)}</text>`,
      );
      parts.push(
        `<text x="${n(labelX)}" y="${n(y + 14)}" font-family="monospace" font-size="8.5" text-anchor="${anchor}" fill="${P.countText}">${tech.count}</text>`,
      );
    }
  }


  parts.push(`</svg>`);
  return parts.join("\n");
}
