"""Deterministic role segmentation from tech_stack co-occurrence.

Segment rules are evaluated in priority order (first match wins).
Precedence rationale: narrower / more signal-dense segments win over broad ones
so that a FinTech stack (Java + Kafka + PostgreSQL) is not swallowed by the
broader Enterprise rule (Java + Azure + SQL).

Priority (highest → lowest):
  1. mobile        — mobile framework or native platform pair
  2. fintech       — JVM language + Kafka
  3. ai_ml         — Python + AI tool, or ≥ 2 AI tools
  4. cloud_platform — ≥ 2 infra/DevOps tools
  5. consulting    — .NET/C# + Angular
  6. enterprise    — Java/Spring + major cloud + SQL flavour
  7. startup_saas  — frontend framework + backend runtime

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
    """Mobile framework alone, or a native platform pair (iOS+Swift, Android+Kotlin)."""
    return (
        _has(stack, "React Native", "Flutter", "SwiftUI")
        or (_has(stack, "iOS") and _has(stack, "Swift"))
        or (_has(stack, "Android") and _has(stack, "Kotlin"))
    )


def _is_fintech(stack: frozenset[str]) -> bool:
    """JVM language + Kafka — event-driven architecture is a strong fintech signal."""
    return _has(stack, "Java", "Kotlin") and _has(stack, "Kafka")


def _is_ai_ml(stack: frozenset[str]) -> bool:
    """Python + any AI/ML tool, or any two AI/ML tools regardless of language."""
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
    return (_has(stack, "Python") and bool(stack & ai_tools)) or _count(stack, *ai_tools) >= 2


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
        "Jenkins",
        "Ansible",
    )
    return _count(stack, *infra_tools) >= 2


def _is_consulting(stack: frozenset[str]) -> bool:
    """.NET or C#  +  Angular (Microsoft consulting archetype)."""
    return _has(stack, ".NET", "C#") and _has(stack, "Angular")


def _is_enterprise(stack: frozenset[str]) -> bool:
    """Java or Spring Boot  +  any major cloud  +  SQL flavour."""
    has_java = _has(stack, "Java", "Spring Boot")
    has_cloud = _has(stack, "AWS", "Azure", "GCP")
    has_sql = _has(stack, "SQL", "PostgreSQL", "MySQL")
    return has_java and has_cloud and has_sql


def _is_startup_saas(stack: frozenset[str]) -> bool:
    """Frontend framework + backend runtime — modern web stack."""
    has_frontend = _has(stack, "React", "Next.js", "Vue", "Svelte")
    has_backend = _has(stack, "Node.js", "Express", "NestJS", "FastAPI", "Django")
    return has_frontend and has_backend


# ── Public API ────────────────────────────────────────────────────────────────


def classify_segment(tech_stack: list[str]) -> str | None:
    """Classify a job's role segment from its normalised tech_stack.

    Evaluates rules in priority order and returns the first matching segment
    slug, or None if no rule matches.

    Priority (most → least specific):
      mobile > fintech > ai_ml > cloud_platform > consulting > enterprise > startup_saas

    Examples
    --------
    >>> classify_segment(["SwiftUI", "iOS"])
    'mobile'
    >>> classify_segment(["Java", "Kafka"])
    'fintech'
    >>> classify_segment(["LangChain", "OpenAI"])
    'ai_ml'   # two AI tools, no Python needed
    >>> classify_segment(["Python", "PyTorch", "AWS", "Kubernetes"])
    'ai_ml'   # ai_ml beats cloud_platform
    >>> classify_segment(["React", "Django"])
    'startup_saas'
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
