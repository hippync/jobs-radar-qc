/**
 * segmentHelpers.ts — deterministic role segmentation from tech_stack
 *
 * Classifies QC job postings into market-relevant segments using
 * tech co-occurrence rules derived from the canonical tech stack.
 *
 * No LLM calls. No DB column. Computed at query time from tech_stack[].
 *
 * Priority order (first match wins, most → least specific):
 *   mobile > fintech > ai_ml > cloud_platform > consulting > enterprise > startup_saas
 *
 * No match → null  ("other" — shown under the "All" filter).
 * Invalid ?segment= param → null  (graceful fallback, same as parseCatsParam).
 *
 * Mirrors core/segment_rules.py — if you change rules here, update there too.
 */

// ── Segment metadata ──────────────────────────────────────────────────────────

export const SEGMENT_LABELS: Record<string, string> = {
  startup_saas:   "Startup SaaS",
  enterprise:     "Enterprise",
  ai_ml:          "AI/ML",
  cloud_platform: "Cloud/Platform",
  consulting:     "Consulting",
  fintech:        "FinTech",
  mobile:         "Mobile",
};

export const VALID_SEGMENTS = new Set(Object.keys(SEGMENT_LABELS));

export type SegmentSlug = keyof typeof SEGMENT_LABELS;

/**
 * All segment slugs in display order for the SegmentFilter UI.
 * Ordered by market relevance for the Quebec tech scene, not by precedence.
 */
export const ALL_SEGMENT_SLUGS: string[] = [
  "startup_saas",
  "enterprise",
  "ai_ml",
  "cloud_platform",
  "consulting",
  "fintech",
  "mobile",
];

// ── Private rule helpers ──────────────────────────────────────────────────────

/** True if *any* of the given names are in the stack (OR semantics). */
function has(stack: Set<string>, ...names: string[]): boolean {
  return names.some((n) => stack.has(n));
}

/** Count how many of the given names are in the stack. */
function count(stack: Set<string>, ...names: string[]): number {
  return names.filter((n) => stack.has(n)).length;
}

// ── Segment classifiers ───────────────────────────────────────────────────────

/** Mobile framework alone, or a native platform pair (iOS+Swift, Android+Kotlin). */
function isMobile(stack: Set<string>): boolean {
  return (
    has(stack, "React Native", "Flutter", "SwiftUI") ||
    (has(stack, "iOS") && has(stack, "Swift")) ||
    (has(stack, "Android") && has(stack, "Kotlin"))
  );
}

/** JVM language + Kafka — event-driven architecture is a strong fintech signal. */
function isFintech(stack: Set<string>): boolean {
  return has(stack, "Java", "Kotlin") && has(stack, "Kafka");
}

/** Python + any AI/ML tool, or any two AI/ML tools regardless of language. */
function isAiMl(stack: Set<string>): boolean {
  const aiTools = [
    "PyTorch", "TensorFlow", "Databricks", "MLflow",
    "LangChain", "OpenAI", "Vector DB", "RAG", "LLM",
  ];
  return (has(stack, "Python") && count(stack, ...aiTools) >= 1) ||
    count(stack, ...aiTools) >= 2;
}

/** At least 2 of the recognised infra/DevOps tools. */
function isCloudPlatform(stack: Set<string>): boolean {
  const infraTools = [
    "Kubernetes", "Terraform", "Docker", "AWS", "GCP",
    "GitHub Actions", "Helm", "ArgoCD", "Prometheus", "Grafana",
    "Jenkins", "Ansible",
  ];
  return count(stack, ...infraTools) >= 2;
}

/** .NET or C#  +  Angular (Microsoft consulting archetype). */
function isConsulting(stack: Set<string>): boolean {
  return has(stack, ".NET", "C#") && has(stack, "Angular");
}

/** Java or Spring Boot  +  any major cloud  +  SQL flavour. */
function isEnterprise(stack: Set<string>): boolean {
  return (
    has(stack, "Java", "Spring Boot") &&
    has(stack, "AWS", "Azure", "GCP") &&
    has(stack, "SQL", "PostgreSQL", "MySQL")
  );
}

/** Frontend framework + backend runtime — modern web stack. */
function isStartupSaaS(stack: Set<string>): boolean {
  return (
    has(stack, "React", "Next.js", "Vue", "Svelte") &&
    has(stack, "Node.js", "Express", "NestJS", "FastAPI", "Django")
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Classify a job's role segment from its normalised tech_stack.
 *
 * Returns the first matching segment slug in priority order:
 *   mobile > fintech > ai_ml > cloud_platform > consulting > enterprise > startup_saas
 *
 * Returns null if no rule matches (job is classified as "other").
 *
 * @example
 * classifySegment(["SwiftUI", "iOS"])                         // "mobile"
 * classifySegment(["Java", "Kafka"])                          // "fintech"
 * classifySegment(["LangChain", "OpenAI"])                    // "ai_ml" (2 AI tools)
 * classifySegment(["Python", "PyTorch", "AWS", "Kubernetes"]) // "ai_ml" (beats cloud_platform)
 * classifySegment(["React", "Next.js", "Django"])             // "startup_saas"
 * classifySegment(["COBOL"])                                  // null
 */
export function classifySegment(techStack: string[]): string | null {
  const stack = new Set(techStack);

  if (isMobile(stack))        return "mobile";
  if (isFintech(stack))       return "fintech";
  if (isAiMl(stack))          return "ai_ml";
  if (isCloudPlatform(stack)) return "cloud_platform";
  if (isConsulting(stack))    return "consulting";
  if (isEnterprise(stack))    return "enterprise";
  if (isStartupSaaS(stack))   return "startup_saas";

  return null;
}

/**
 * Parse and validate a ?segment= URL parameter.
 *
 * - Returns the slug if it matches a known segment.
 * - Returns null for missing, empty, "all", or unrecognised values.
 *
 * This mirrors the graceful-fallback behaviour of parseCatsParam:
 * invalid input silently falls back to "no filter" rather than 400.
 */
export function parseSegment(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === "" || raw === "all") return null;
  const slug = raw.trim().toLowerCase();
  return VALID_SEGMENTS.has(slug) ? slug : null;
}
