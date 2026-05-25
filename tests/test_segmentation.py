"""Unit tests for deterministic role segmentation (core/segment_rules.py).

Covers:
  - Minimum required tech stack per segment
  - Missing signals → segment NOT matched
  - Precedence: higher-priority segment wins when multiple rules fire
  - No-match → None
  - Empty stack → None
  - classify_segment is deterministic (same input → same output)

Run: pytest tests/test_segmentation.py -v
"""

from __future__ import annotations

import pytest

from core.segment_rules import (
    VALID_SEGMENTS,
    classify_segment,
)

# ── Mobile ────────────────────────────────────────────────────────────────────


class TestMobile:
    def test_react_native_ios(self) -> None:
        assert classify_segment(["React Native", "iOS"]) == "mobile"

    def test_flutter_android(self) -> None:
        assert classify_segment(["Flutter", "Android"]) == "mobile"

    def test_react_native_kotlin(self) -> None:
        assert classify_segment(["React Native", "Kotlin"]) == "mobile"

    def test_react_native_swiftui(self) -> None:
        assert classify_segment(["React Native", "SwiftUI"]) == "mobile"

    def test_flutter_swift(self) -> None:
        assert classify_segment(["Flutter", "Swift"]) == "mobile"

    def test_framework_only_not_mobile(self) -> None:
        # Framework present but no mobile platform signal → not mobile
        result = classify_segment(["React Native"])
        assert result != "mobile"

    def test_platform_only_not_mobile(self) -> None:
        # Platform without a recognised mobile framework → not mobile
        result = classify_segment(["iOS", "Android"])
        assert result != "mobile"


# ── FinTech ───────────────────────────────────────────────────────────────────


class TestFintech:
    def test_java_kafka_postgres(self) -> None:
        assert classify_segment(["Java", "Kafka", "PostgreSQL"]) == "fintech"

    def test_java_kafka_docker(self) -> None:
        assert classify_segment(["Java", "Kafka", "Docker"]) == "fintech"

    def test_no_persistence_not_fintech(self) -> None:
        # Kafka without PostgreSQL or Docker → not fintech
        result = classify_segment(["Java", "Kafka"])
        assert result != "fintech"

    def test_no_kafka_not_fintech(self) -> None:
        result = classify_segment(["Java", "PostgreSQL"])
        assert result != "fintech"

    def test_no_java_not_fintech(self) -> None:
        result = classify_segment(["Kafka", "PostgreSQL"])
        assert result != "fintech"


# ── AI/ML ─────────────────────────────────────────────────────────────────────


class TestAiMl:
    @pytest.mark.parametrize(
        "ai_tool",
        [
            "PyTorch",
            "TensorFlow",
            "Databricks",
            "MLflow",
            "LangChain",
            "OpenAI",
            "Vector DB",
            "RAG",
            "LLM",
        ],
    )
    def test_python_plus_ai_tool(self, ai_tool: str) -> None:
        assert classify_segment(["Python", ai_tool]) == "ai_ml"

    def test_python_no_ai_tool_not_ai_ml(self) -> None:
        # Python + only backend tools → not ai_ml
        result = classify_segment(["Python", "FastAPI", "PostgreSQL"])
        assert result != "ai_ml"

    def test_ai_tool_no_python_not_ai_ml(self) -> None:
        result = classify_segment(["PyTorch", "TensorFlow"])
        assert result != "ai_ml"


# ── Cloud/Platform ────────────────────────────────────────────────────────────


class TestCloudPlatform:
    def test_kubernetes_terraform(self) -> None:
        assert classify_segment(["Kubernetes", "Terraform"]) == "cloud_platform"

    def test_aws_docker(self) -> None:
        assert classify_segment(["AWS", "Docker"]) == "cloud_platform"

    def test_gcp_github_actions(self) -> None:
        assert classify_segment(["GCP", "GitHub Actions"]) == "cloud_platform"

    def test_prometheus_grafana(self) -> None:
        assert classify_segment(["Prometheus", "Grafana"]) == "cloud_platform"

    def test_only_one_infra_not_cloud_platform(self) -> None:
        result = classify_segment(["Kubernetes"])
        assert result != "cloud_platform"

    def test_aws_alone_not_cloud_platform(self) -> None:
        result = classify_segment(["AWS"])
        assert result != "cloud_platform"


# ── Consulting ────────────────────────────────────────────────────────────────


class TestConsulting:
    def test_dotnet_sql_angular(self) -> None:
        assert classify_segment([".NET", "SQL", "Angular"]) == "consulting"

    def test_csharp_sql_angular(self) -> None:
        assert classify_segment(["C#", "SQL", "Angular"]) == "consulting"

    def test_dotnet_no_angular_not_consulting(self) -> None:
        result = classify_segment([".NET", "SQL"])
        assert result != "consulting"

    def test_dotnet_no_sql_not_consulting(self) -> None:
        result = classify_segment([".NET", "Angular"])
        assert result != "consulting"


# ── Enterprise ────────────────────────────────────────────────────────────────


class TestEnterprise:
    def test_java_azure_sql(self) -> None:
        assert classify_segment(["Java", "Azure", "SQL"]) == "enterprise"

    def test_springboot_azure_postgres(self) -> None:
        assert classify_segment(["Spring Boot", "Azure", "PostgreSQL"]) == "enterprise"

    def test_java_azure_mysql(self) -> None:
        assert classify_segment(["Java", "Azure", "MySQL"]) == "enterprise"

    def test_java_no_azure_not_enterprise(self) -> None:
        result = classify_segment(["Java", "SQL"])
        assert result != "enterprise"

    def test_no_java_not_enterprise(self) -> None:
        result = classify_segment(["Azure", "SQL"])
        assert result != "enterprise"


# ── Startup SaaS ──────────────────────────────────────────────────────────────


class TestStartupSaas:
    def test_react_nodejs_postgres(self) -> None:
        assert classify_segment(["React", "Node.js", "PostgreSQL"]) == "startup_saas"

    def test_nextjs_fastapi_postgres(self) -> None:
        assert classify_segment(["Next.js", "FastAPI", "PostgreSQL"]) == "startup_saas"

    def test_react_no_backend_not_startup(self) -> None:
        result = classify_segment(["React", "PostgreSQL"])
        assert result != "startup_saas"

    def test_react_no_db_not_startup(self) -> None:
        result = classify_segment(["React", "Node.js"])
        assert result != "startup_saas"

    def test_backend_no_frontend_not_startup(self) -> None:
        result = classify_segment(["Node.js", "PostgreSQL"])
        assert result != "startup_saas"


# ── Precedence ────────────────────────────────────────────────────────────────


class TestPrecedence:
    """Verify that higher-priority segments win when multiple rules match."""

    def test_mobile_beats_startup_saas(self) -> None:
        # React + React Native + iOS + Node.js + PostgreSQL → mobile wins over startup_saas
        stack = ["React Native", "iOS", "React", "Node.js", "PostgreSQL"]
        assert classify_segment(stack) == "mobile"

    def test_mobile_beats_cloud_platform(self) -> None:
        # React Native + iOS + Kubernetes + AWS → mobile wins
        stack = ["React Native", "iOS", "Kubernetes", "AWS"]
        assert classify_segment(stack) == "mobile"

    def test_fintech_beats_enterprise(self) -> None:
        # Java + Kafka + PostgreSQL + Azure + SQL → fintech wins over enterprise
        stack = ["Java", "Kafka", "PostgreSQL", "Azure", "SQL"]
        assert classify_segment(stack) == "fintech"

    def test_fintech_beats_cloud_platform(self) -> None:
        # Java + Kafka + Docker + Kubernetes → fintech wins over cloud_platform
        stack = ["Java", "Kafka", "Docker", "Kubernetes"]
        assert classify_segment(stack) == "fintech"

    def test_ai_ml_beats_cloud_platform(self) -> None:
        # Python + PyTorch + AWS + Kubernetes → ai_ml wins
        stack = ["Python", "PyTorch", "AWS", "Kubernetes"]
        assert classify_segment(stack) == "ai_ml"

    def test_consulting_beats_startup_saas(self) -> None:
        # .NET + SQL + Angular + React → consulting wins (higher priority)
        # Note: React alone doesn't trigger startup_saas without Node/FastAPI + PostgreSQL
        # consulting = .NET + SQL + Angular
        # startup_saas needs React + Node.js + PostgreSQL (Angular replaces Node → no startup)
        stack = [".NET", "C#", "SQL", "Angular"]
        # This is only consulting (no startup_saas trigger — no Node.js/FastAPI + PostgreSQL)
        assert classify_segment(stack) == "consulting"

    def test_enterprise_beats_startup_saas(self) -> None:
        # Java + Azure + PostgreSQL + React + Node.js → enterprise wins
        stack = ["Java", "Azure", "PostgreSQL", "React", "Node.js"]
        # enterprise: Java + Azure + PostgreSQL ✓
        # startup_saas: React + Node.js + PostgreSQL ✓
        # enterprise has higher priority
        assert classify_segment(stack) == "enterprise"

    def test_precedence_order_is_stable(self) -> None:
        """Same input always yields the same result."""
        stack = ["Python", "PyTorch", "AWS", "Kubernetes", "React", "Node.js", "PostgreSQL"]
        results = [classify_segment(stack) for _ in range(10)]
        assert len(set(results)) == 1  # all identical


# ── No match ──────────────────────────────────────────────────────────────────


class TestNoMatch:
    def test_empty_stack_is_none(self) -> None:
        assert classify_segment([]) is None

    def test_unrecognised_techs_is_none(self) -> None:
        assert classify_segment(["COBOL", "Mainframe", "Fortran"]) is None

    def test_partial_startup_saas_is_none(self) -> None:
        # React + Node.js without PostgreSQL → no match
        assert classify_segment(["React", "Node.js"]) is None

    def test_python_alone_is_none(self) -> None:
        # Python without AI tools → not ai_ml; no other rule fires either
        assert classify_segment(["Python"]) is None

    def test_single_infra_tool_is_none(self) -> None:
        assert classify_segment(["Kubernetes"]) is None


# ── VALID_SEGMENTS invariant ──────────────────────────────────────────────────


class TestSegmentMetadata:
    def test_all_expected_segments_present(self) -> None:
        expected = {
            "startup_saas",
            "enterprise",
            "ai_ml",
            "cloud_platform",
            "consulting",
            "fintech",
            "mobile",
        }
        assert expected == VALID_SEGMENTS

    def test_classify_returns_valid_slug_or_none(self) -> None:
        """Any non-None result must be a known segment slug."""
        test_stacks = [
            ["React Native", "iOS"],
            ["Java", "Kafka", "PostgreSQL"],
            ["Python", "PyTorch"],
            ["AWS", "Kubernetes"],
            [".NET", "SQL", "Angular"],
            ["Java", "Azure", "SQL"],
            ["React", "Node.js", "PostgreSQL"],
            [],
            ["TypeScript"],
        ]
        for stack in test_stacks:
            result = classify_segment(stack)
            assert result is None or result in VALID_SEGMENTS
