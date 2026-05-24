/**
 * radarHelpers.ts — shared pure helpers for the Tech Stack Radar
 *
 * Mirrors core/canonical_tech_stack.json (version 2).
 * If the canonical JSON is bumped, update CANONICAL below and
 * the ALL_CAT_SLUGS / CATEGORY_LABELS constants accordingly.
 */

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
  "data_ai",
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
  data_ai:     "Data / AI",
  mobile:      "Mobile",
  testing:     "Testing",
  ai_concepts: "AI Concepts",
};

/**
 * CSS slug — convert underscore-separated slug to hyphen for CSS custom
 * property names. Example: "data_ai" → "data-ai", "ai_concepts" → "ai-concepts".
 */
export function catToCssSlug(slug: string): string {
  return slug.replace(/_/g, "-");
}

/** Default radar sectors (shown when no ?cats= param is present). */
export const DEFAULT_CATS: readonly string[] = [
  "languages",
  "frontend",
  "devops",
  "data_ai",
];

/**
 * Inline canonical data — mirrors core/canonical_tech_stack.json v2.
 * Kept here so the frontend bundle is self-contained and the helpers
 * can be unit-tested without filesystem access.
 */
export const CANONICAL: CanonicalStack = {
  version: "2",
  categories: {
    languages: [
      "Python", "Java", "TypeScript", "JavaScript", "C#", "Go",
      "SQL", "Kotlin", "Swift", "Rust",
    ],
    frontend: [
      "React", "Next.js", "Angular", "Vue", "Tailwind", "Redux", "Svelte",
    ],
    backend: [
      "Spring Boot", "Node.js", "Express", "NestJS", ".NET",
      "Django", "FastAPI", "GraphQL", "REST", "gRPC",
    ],
    databases: [
      "PostgreSQL", "MySQL", "MongoDB", "Redis",
      "DynamoDB", "Snowflake", "Elasticsearch", "ClickHouse",
    ],
    cloud: [
      "AWS", "Azure", "GCP", "Linux", "Nginx", "Cloudflare",
    ],
    devops: [
      "Docker", "Kubernetes", "Terraform", "Helm",
      "GitHub Actions", "Jenkins", "ArgoCD",
      "Prometheus", "Grafana", "Ansible",
    ],
    data_ai: [
      "Pandas", "Spark", "Databricks", "Airflow",
      "TensorFlow", "PyTorch", "LangChain", "OpenAI",
      "Vector DB", "dbt", "Kafka", "MLflow",
    ],
    mobile: [
      "React Native", "Flutter", "SwiftUI", "Android", "iOS",
    ],
    testing: [
      "Jest", "Cypress", "Playwright", "Selenium", "JUnit", "Postman",
    ],
    ai_concepts: [
      "LLM", "RAG",
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
