"""Deterministic role segmentation from tech_stack co-occurrence.

Segment rules are evaluated in priority order (first match wins).
Precedence rationale: narrower / more signal-dense segments win over broad ones
so that a FinTech stack (Java + Kafka + PostgreSQL) is not swallowed by the
broader Enterprise rule (Java + Azure + SQL).

Priority (highest → lowest):
  1. mobile        — unique platform signal (React Native/Flutter + mobile OS)
  2. fintech       — narrow combo (Java + Kafka + DB/container)
  3. ai_ml         — Python + at least one AI/ML tool
  4. cloud_platform — infra density (≥ 2 infra tools)
  5. consulting    — .NET/C# + SQL + Angular
  6. enterprise    — Java/Spring + Azure + SQL flavour
  7. startup_saas  — broadest web-stack pattern

No match → None  ("other" — job is still visible under the "All" filter).

This module is mirrored in frontend/lib/segmentHelpers.ts.
If you change rules here, keep both files in sync.
"""

from __future__ import annotations

SEGMENT_LABELS: dict[str, str] = {
    "startup_saas": "Startup SaaS",
    "enterprise": "Enterprise",
    "ai_ml": "AI/ML",
    "cloud_platform": "Cloud/Platform",
    "consulting": "Consulting",
    "fintech": "FinTech",
    "mobile": "Mobile",
}

VALID_SEGMENTS: frozenset[str] = frozenset(SEGMENT_LABELS)

# ── Private rule helpers ──────────────────────────────────────────────────────


def _has(stack: frozenset[str], *names: str) -> bool:
    """True if *any* of *names* are in *stack* (OR semantics)."""
    return bool(stack & frozenset(names))


def _count(stack: frozenset[str], *names: str) -> int:
    """Count how many of *names* are in *stack*."""
    return len(stack & frozenset(names))


# ── Segment classifiers ───────────────────────────────────────────────────────


def _is_mobile(stack: frozenset[str]) -> bool:
    """React Native or Flutter  +  at least one mobile platform/language."""
    has_framework = _has(stack, "React Native", "Flutter")
    has_platform = _has(stack, "iOS", "Android", "Swift", "Kotlin", "SwiftUI")
    return has_framework and has_platform


def _is_fintech(stack: frozenset[str]) -> bool:
    """Java  +  Kafka  +  (PostgreSQL or Docker)."""
    has_persistence = _has(stack, "PostgreSQL", "Docker")
    return _has(stack, "Java") and _has(stack, "Kafka") and has_persistence


def _is_ai_ml(stack: frozenset[str]) -> bool:
    """Python  +  at least one AI/ML tool from the canonical set."""
    ai_tools = frozenset(
        {
            "PyTorch",
            "TensorFlow",
            "Databricks",
            "MLflow",
            "LangChain",
            "OpenAI",
            "Vector DB",
            "RAG",
            "LLM",
        }
    )
    return _has(stack, "Python") and bool(stack & ai_tools)


def _is_cloud_platform(stack: frozenset[str]) -> bool:
    """At least 2 of the recognised infra/DevOps tools."""
    infra_tools = (
        "Kubernetes",
        "Terraform",
        "Docker",
        "AWS",
        "GCP",
        "GitHub Actions",
        "Helm",
        "ArgoCD",
        "Prometheus",
        "Grafana",
    )
    return _count(stack, *infra_tools) >= 2


def _is_consulting(stack: frozenset[str]) -> bool:
    """.NET or C#  +  SQL  +  Angular."""
    return _has(stack, ".NET", "C#") and _has(stack, "SQL") and _has(stack, "Angular")


def _is_enterprise(stack: frozenset[str]) -> bool:
    """Java or Spring Boot  +  Azure  +  SQL flavour (SQL, PostgreSQL, MySQL)."""
    has_java = _has(stack, "Java", "Spring Boot")
    has_cloud = _has(stack, "Azure")
    has_sql = _has(stack, "SQL", "PostgreSQL", "MySQL")
    return has_java and has_cloud and has_sql


def _is_startup_saas(stack: frozenset[str]) -> bool:
    """(React or Next.js)  +  (Node.js or FastAPI)  +  PostgreSQL."""
    has_frontend = _has(stack, "React", "Next.js")
    has_backend = _has(stack, "Node.js", "FastAPI")
    has_db = _has(stack, "PostgreSQL")
    return has_frontend and has_backend and has_db


# ── Public API ────────────────────────────────────────────────────────────────


def classify_segment(tech_stack: list[str]) -> str | None:
    """Classify a job's role segment from its normalised tech_stack.

    Evaluates rules in priority order and returns the first matching segment
    slug, or None if no rule matches.

    Priority (most → least specific):
      mobile > fintech > ai_ml > cloud_platform > consulting > enterprise > startup_saas

    Examples
    --------
    >>> classify_segment(["React Native", "iOS", "TypeScript"])
    'mobile'
    >>> classify_segment(["Java", "Kafka", "PostgreSQL"])
    'fintech'
    >>> classify_segment(["Python", "PyTorch", "AWS", "Kubernetes"])
    'ai_ml'   # ai_ml beats cloud_platform
    >>> classify_segment(["COBOL"])
    None
    """
    stack: frozenset[str] = frozenset(tech_stack)

    if _is_mobile(stack):
        return "mobile"
    if _is_fintech(stack):
        return "fintech"
    if _is_ai_ml(stack):
        return "ai_ml"
    if _is_cloud_platform(stack):
        return "cloud_platform"
    if _is_consulting(stack):
        return "consulting"
    if _is_enterprise(stack):
        return "enterprise"
    if _is_startup_saas(stack):
        return "startup_saas"

    return None
