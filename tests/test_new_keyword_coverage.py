"""Coverage tests for new keywords added in issue #59.

Validates that every technology added to canonical_tech_stack.json v2 (issue #58)
is now extractable by the deterministic Layer 1 engine.

Covers:
  - Languages: SQL (standalone; not MySQL/PostgreSQL)
  - Frontend: Tailwind, Tailwind CSS, Redux
  - Mobile: SwiftUI
  - Backend: NestJS, Spring Boot canonical rename
  - DevOps: Helm, ArgoCD (both forms), Prometheus, Grafana, Jenkins
  - Cloud: Nginx, Cloudflare
  - Data & AI: LangChain, OpenAI, MLflow, Vector DB (6 surface forms)
  - Testing / QA: Jest, Cypress, Playwright, Selenium, JUnit, Postman
  - Workable Go bug fix: standalone "Go", "Golang", negative for lowercase prose "go"
"""

from __future__ import annotations

import pytest

from pipeline.extractor import Extractor

# ─── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def gh() -> Extractor:
    """Greenhouse extractor — uses title + description_html for matching."""
    return Extractor("greenhouse")


@pytest.fixture(scope="module")
def workable() -> Extractor:
    """Workable extractor — uses title only for matching."""
    return Extractor("workable")


# ─── Helpers ─────────────────────────────────────────────────────────────────

_COMPANY = {"name": "TestCo", "slug": "testco"}


def _gh_job(description: str, title: str = "Software Engineer") -> dict:
    """Minimal Greenhouse raw job dict for extraction tests."""
    return {
        "id": "test-1",
        "title": title,
        "absolute_url": "https://example.com/job/test-1",
        "content": description,
        "updated_at": "2025-01-01T00:00:00Z",
        "departments": [],
        "location": {"name": "Montréal, QC"},
    }


def _workable_job(title: str) -> dict:
    """Minimal Workable raw job dict for extraction tests (title-only matching)."""
    return {
        "external_id": "wk-1",
        "source_url": "https://apply.workable.com/testco/j/1",
        "title": title,
        "department": "Engineering",
        "location": "Montréal, QC",
        "_posted_raw": "2025-01-01",
        "_employment_raw": "Full-time",
    }


# ─── Positive detection: all new canonical keywords ──────────────────────────


class TestNewKeywordCoverage:
    """Every new canonical tech added in #59 must be extractable from description."""

    @pytest.mark.parametrize(
        "description, expected_tech",
        [
            # Languages
            ("We require strong SQL skills.", "SQL"),
            # Frontend
            ("UI built with Tailwind for styling.", "Tailwind"),
            ("Uses Tailwind CSS design system.", "Tailwind"),
            ("State management via Redux.", "Redux"),
            # Mobile
            ("Native iOS views in SwiftUI.", "SwiftUI"),
            # Backend
            ("REST API built with NestJS.", "NestJS"),
            # DevOps
            ("Charts deployed with Helm.", "Helm"),
            ("GitOps pipeline managed by ArgoCD.", "ArgoCD"),
            ("GitOps pipeline managed by Argo CD.", "ArgoCD"),
            ("Metrics collected by Prometheus.", "Prometheus"),
            ("Dashboards built in Grafana.", "Grafana"),
            ("CI pipelines run on Jenkins.", "Jenkins"),
            # Cloud
            ("Served through Nginx reverse proxy.", "Nginx"),
            ("Traffic routed through Cloudflare.", "Cloudflare"),
            # Data & AI
            ("Orchestration via LangChain.", "LangChain"),
            ("Integrates with the OpenAI API.", "OpenAI"),
            ("Model tracking with MLflow.", "MLflow"),
            # Vector DB surface forms
            ("Embeddings stored in Pinecone.", "Vector DB"),
            ("Semantic search using Qdrant.", "Vector DB"),
            ("Vector store powered by Weaviate.", "Vector DB"),
            ("Chroma for local embedding retrieval.", "Vector DB"),
            ("Maintains a vector database for search.", "Vector DB"),
            ("Uses a vector store for RAG retrieval.", "Vector DB"),
            ("Queries a vector DB for similarity search.", "Vector DB"),
            # Testing / QA
            ("Unit tests written with Jest.", "Jest"),
            ("End-to-end tests with Cypress.", "Cypress"),
            ("Browser automation via Playwright.", "Playwright"),
            ("Test suite runs on Selenium.", "Selenium"),
            ("Java unit tests use JUnit.", "JUnit"),
            ("API testing workflow in Postman.", "Postman"),
        ],
    )
    def test_positive_detection(
        self, gh: Extractor, description: str, expected_tech: str
    ) -> None:
        result = gh._apply_extraction(_gh_job(description), _COMPANY)
        assert expected_tech in result["tech_stack"], (
            f"Expected {expected_tech!r} to be detected from description: {description!r}"
        )


# ─── SQL: word-boundary boundary tests ───────────────────────────────────────


class TestSQLBoundary:
    """SQL must match standalone but not as a substring inside MySQL / PostgreSQL."""

    def test_sql_standalone_detected(self, gh: Extractor) -> None:
        result = gh._apply_extraction(
            _gh_job("3+ years of SQL experience required."), _COMPANY
        )
        assert "SQL" in result["tech_stack"]

    def test_sql_not_matched_inside_mysql(self, gh: Extractor) -> None:
        """MySQL must not produce a spurious SQL hit."""
        result = gh._apply_extraction(
            _gh_job("Database layer uses MySQL for transactional data."), _COMPANY
        )
        assert "SQL" not in result["tech_stack"], (
            "SQL must not be extracted from a posting that only mentions MySQL."
        )

    def test_sql_not_matched_inside_postgresql(self, gh: Extractor) -> None:
        """PostgreSQL must not produce a spurious SQL hit."""
        result = gh._apply_extraction(
            _gh_job("Persistent storage in PostgreSQL 15."), _COMPANY
        )
        assert "SQL" not in result["tech_stack"], (
            "SQL must not be extracted from a posting that only mentions PostgreSQL."
        )

    def test_both_sql_and_mysql_when_explicitly_named(self, gh: Extractor) -> None:
        """When both are named, both should be present."""
        result = gh._apply_extraction(
            _gh_job("Experience with SQL queries and MySQL administration."), _COMPANY
        )
        assert "SQL" in result["tech_stack"]
        assert "MySQL" in result["tech_stack"]


# ─── Spring Boot canonical rename ────────────────────────────────────────────


class TestSpringBootCanonical:
    """Spring(?:\\s+Boot)? must now emit 'Spring Boot', not 'Spring'."""

    def test_spring_maps_to_spring_boot(self, gh: Extractor) -> None:
        """Plain 'Spring' mention should produce canonical 'Spring Boot'."""
        result = gh._apply_extraction(
            _gh_job("Backend microservices built with Spring framework."), _COMPANY
        )
        assert "Spring Boot" in result["tech_stack"], (
            "Plain 'Spring' must map to canonical 'Spring Boot'."
        )
        assert "Spring" not in result["tech_stack"], (
            "Old canonical 'Spring' must no longer appear."
        )

    def test_spring_boot_explicit_maps_to_spring_boot(self, gh: Extractor) -> None:
        """Explicit 'Spring Boot' mention must also produce canonical 'Spring Boot'."""
        result = gh._apply_extraction(
            _gh_job("REST API built with Spring Boot and Java."), _COMPANY
        )
        assert "Spring Boot" in result["tech_stack"]


# ─── Workable Go bug fix ─────────────────────────────────────────────────────


class TestWorkableGoBugFix:
    """Workable Go pattern must detect 'Go' and 'Golang' in titles but not prose 'go'."""

    def test_go_in_title_detected(self, workable: Extractor) -> None:
        """Job title with 'Go' as a standalone word must be detected."""
        result = workable._apply_extraction(_workable_job("Go Backend Developer"), _COMPANY)
        assert "Go" in result["tech_stack"], (
            "'Go' in a job title must be detected as the Go language."
        )

    def test_golang_in_title_detected(self, workable: Extractor) -> None:
        """'Golang' in a title must map to canonical 'Go'."""
        result = workable._apply_extraction(_workable_job("Senior Golang Engineer"), _COMPANY)
        assert "Go" in result["tech_stack"], (
            "'Golang' in a job title must map to canonical 'Go'."
        )

    def test_lowercase_go_in_prose_not_detected(self, workable: Extractor) -> None:
        """Lowercase 'go' inside ordinary words must not trigger a false positive.

        Previously <kw canonical="Go">Golang</kw> only matched Golang, but after adding
        case_sensitive="true" with \\b(?:Go|Golang)\\b, 'go' in words like 'agora',
        'undergo', or just the word 'go' should not match.
        """
        result = workable._apply_extraction(
            _workable_job("Product Manager — go-to-market strategy"), _COMPANY
        )
        assert "Go" not in result["tech_stack"], (
            "'go' in 'go-to-market' must not match the Go language (case-sensitive guard)."
        )

    def test_go_not_matched_inside_agora(self, workable: Extractor) -> None:
        """'Go' must not match the substring inside 'Agora'."""
        result = workable._apply_extraction(
            _workable_job("Agora Platform Developer"), _COMPANY
        )
        assert "Go" not in result["tech_stack"], (
            "'Go' must not be extracted from 'Agora'."
        )
