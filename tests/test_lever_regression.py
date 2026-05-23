"""Regression tests for Lever tech_stack extraction accuracy.

Covers two real postings that exposed three bugs:

  Bug 1 — False negative (BHVR): Lever's `lists` field was not mapped.
    Technologies mentioned only in requirement/responsibility list sections
    (e.g. "Strong C++ expertise") were never seen by the keyword matcher.

  Bug 2 — False positives (Plusgrade): `word_boundary="true"` was declared
    in extraction.xml but not implemented in _collect_keywords.  Without it:
    - "Rust"  matched "trust"    ("We trust our teams")
    - "Vue"   matched "Entrevue" (French word for "interview")
    - "Scala" would match "scalability"

  Bug 3 — False positive (Plusgrade): Raw HTML was searched without stripping
    tags first. The Plusgrade description contains AI-generated HTML with
    data-path-to-node attributes on every paragraph; "node" in those attributes
    triggered the Node(?:\\.js)? pattern.

Fixtures are saved API responses from:
  https://api.lever.co/v0/postings/bhvr/b4582013-a93f-4b94-adef-1718407eaece
  https://api.lever.co/v0/postings/plusgrade/eef73166-44b4-4355-bf9d-12607f61748c
"""

import json
from pathlib import Path

import pytest

from pipeline.extractor import Extractor

FIXTURES = Path(__file__).parent / "fixtures"

_COMPANY_BHVR = {"name": "Behaviour Interactive", "slug": "bhvr"}
_COMPANY_PLUSGRADE = {"name": "Plusgrade", "slug": "plusgrade"}


@pytest.fixture(scope="module")
def lever() -> Extractor:
    return Extractor("lever")


@pytest.fixture(scope="module")
def bhvr_raw() -> dict:
    return json.loads((FIXTURES / "lever_bhvr_job.json").read_text())


@pytest.fixture(scope="module")
def plusgrade_raw() -> dict:
    return json.loads((FIXTURES / "lever_plusgrade_job.json").read_text())


# ─── BHVR: Senior System Programmer ─────────────────────────────────────────


class TestBHVRSeniorSystemProgrammer:
    """Bug 1: C++ was missing because it appeared only in the lists[] sections."""

    def test_cpp_detected(self, lever: Extractor, bhvr_raw: dict) -> None:
        """C++ is explicitly required but only stated in the requirement list."""
        result = lever._apply_extraction(bhvr_raw, _COMPANY_BHVR)
        assert "C++" in result["tech_stack"], (
            "C++ must be extracted — it is explicitly required in the job's "
            "'What we're looking for' list section."
        )

    def test_no_unreal_engine(self, lever: Extractor, bhvr_raw: dict) -> None:
        """Unreal Engine is mentioned but is not in the canonical list."""
        result = lever._apply_extraction(bhvr_raw, _COMPANY_BHVR)
        # Unreal Engine is not in canonical_tech_stack.json — should not appear
        assert "Unreal Engine" not in result["tech_stack"]

    def test_no_spurious_techs(self, lever: Extractor, bhvr_raw: dict) -> None:
        """A systems-programming game job should not produce a cloud/web stack."""
        result = lever._apply_extraction(bhvr_raw, _COMPANY_BHVR)
        spurious = {"React", "Node.js", "Python", "Docker", "Kubernetes", "AWS"}
        found = spurious & set(result["tech_stack"])
        assert not found, f"Spurious technologies extracted: {found}"


# ─── Plusgrade: Principal Software Developer (Payments) ──────────────────────


class TestPlusgradePaymentsEngineer:
    """Bugs 2 & 3: False positives from missing word-boundary and raw-HTML search."""

    def test_explicit_stack_present(self, lever: Extractor, plusgrade_raw: dict) -> None:
        """Explicitly listed stack: Java, Spring Boot, TypeScript, React, AWS, Docker, REST.

        Note: canonical was renamed "Spring" → "Spring Boot" in extraction.xml v2 to align with
        canonical_tech_stack.json v2.  The pattern Spring(?:\\s+Boot)? still matches plain "Spring".
        """
        result = lever._apply_extraction(plusgrade_raw, _COMPANY_PLUSGRADE)
        stack = set(result["tech_stack"])
        expected = {"Java", "Spring Boot", "TypeScript", "React", "AWS", "Docker", "REST"}
        missing = expected - stack
        assert not missing, f"Explicitly listed technologies are missing: {missing}"

    def test_rust_not_extracted(self, lever: Extractor, plusgrade_raw: dict) -> None:
        """Bug 2: 'Rust' must not match 'trust' in 'We trust our teams'."""
        result = lever._apply_extraction(plusgrade_raw, _COMPANY_PLUSGRADE)
        assert "Rust" not in result["tech_stack"], (
            "Rust is a false positive: it matched 'trust' in the description. "
            "Word-boundary enforcement must prevent this."
        )

    def test_vue_not_extracted(self, lever: Extractor, plusgrade_raw: dict) -> None:
        """Bug 2: 'Vue' must not match 'Entrevue' (French for 'interview')."""
        result = lever._apply_extraction(plusgrade_raw, _COMPANY_PLUSGRADE)
        assert "Vue" not in result["tech_stack"], (
            "Vue is a false positive: it matched 'Entrevue' (French for interview). "
            "Word-boundary enforcement must prevent this."
        )

    def test_nodejs_not_extracted(self, lever: Extractor, plusgrade_raw: dict) -> None:
        """Bug 3: Node.js must not be extracted from data-path-to-node HTML attributes."""
        result = lever._apply_extraction(plusgrade_raw, _COMPANY_PLUSGRADE)
        assert "Node.js" not in result["tech_stack"], (
            "Node.js is a false positive: it matched 'node' inside data-path-to-node "
            "HTML attributes. HTML must be stripped before keyword matching."
        )

    def test_kubernetes_not_extracted(self, lever: Extractor, plusgrade_raw: dict) -> None:
        """Kubernetes is not named — only 'EKS' appears. Should not be inferred."""
        result = lever._apply_extraction(plusgrade_raw, _COMPANY_PLUSGRADE)
        assert "Kubernetes" not in result["tech_stack"], (
            "Kubernetes must not be inferred from 'EKS' alone — it is not explicitly named."
        )

    def test_scala_not_extracted(self, lever: Extractor, plusgrade_raw: dict) -> None:
        """Scala must not match 'scalability' or 'scalable'."""
        result = lever._apply_extraction(plusgrade_raw, _COMPANY_PLUSGRADE)
        assert "Scala" not in result["tech_stack"], (
            "Scala is not in this job. Word boundaries must prevent it from matching "
            "words like 'scalability'."
        )


# ─── Shared: separation of deterministic and enrichment fields ───────────────


class TestFieldSeparation:
    """Verify the architectural contract: tech_stack is written by extraction,
    enriched_tech_stack by enrichment; they must never overwrite each other."""

    def test_tech_stack_present_after_extraction(
        self, lever: Extractor, bhvr_raw: dict
    ) -> None:
        result = lever._apply_extraction(bhvr_raw, _COMPANY_BHVR)
        assert "tech_stack" in result
        assert isinstance(result["tech_stack"], list)

    def test_enriched_tech_stack_not_written_by_extraction(
        self, lever: Extractor, bhvr_raw: dict
    ) -> None:
        """The deterministic extractor must never produce enriched_tech_stack."""
        result = lever._apply_extraction(bhvr_raw, _COMPANY_BHVR)
        assert "enriched_tech_stack" not in result


# ─── Special-character tech names ────────────────────────────────────────────


class TestSpecialCharTechNames:
    """Verify that C++, C#, .NET, Node.js, Vue.js, Next.js are handled correctly."""

    @pytest.mark.parametrize(
        "description, expected",
        [
            ("Expert C++ and low-level programming", ["C++"]),
            ("Experience with C# and .NET", ["C#", ".NET"]),
            ("Built with ASP.NET MVC", ["ASP.NET", ".NET"]),
            ("Frontend in Vue.js and Next.js", ["Vue", "Next.js"]),
            ("Backend services in Node.js", ["Node.js"]),
        ],
    )
    def test_special_char_extraction(
        self, lever: Extractor, description: str, expected: list[str]
    ) -> None:
        raw = {
            "id": "test-id",
            "text": "Software Engineer",
            "hostedUrl": "https://jobs.lever.co/test/test-id",
            "description": description,
            "lists": [],
            "categories": {"location": "Montreal, QC", "commitment": "Full-Time"},
            "workplaceType": "hybrid",
            "createdAt": 1700000000000,
        }
        result = lever._apply_extraction(raw, {"name": "TestCo", "slug": "testco"})
        for tech in expected:
            assert tech in result["tech_stack"], (
                f"Expected {tech!r} in tech_stack for description: {description!r}"
            )

    def test_java_not_matched_inside_javascript(self, lever: Extractor) -> None:
        raw = {
            "id": "test-id",
            "text": "Frontend Engineer",
            "hostedUrl": "https://jobs.lever.co/test/test-id",
            "description": "Full-stack JavaScript developer, TypeScript preferred.",
            "lists": [],
            "categories": {"location": "Montreal, QC", "commitment": "Full-Time"},
            "workplaceType": "hybrid",
            "createdAt": 1700000000000,
        }
        result = lever._apply_extraction(raw, {"name": "TestCo", "slug": "testco"})
        assert "Java" not in result["tech_stack"], (
            "Java must not be extracted from a posting that only mentions JavaScript."
        )
        assert "JavaScript" in result["tech_stack"]

    def test_rust_not_matched_inside_trust(self, lever: Extractor) -> None:
        raw = {
            "id": "test-id",
            "text": "Engineering Manager",
            "hostedUrl": "https://jobs.lever.co/test/test-id",
            "description": "We trust our teams to ship quality software.",
            "lists": [],
            "categories": {"location": "Montreal, QC", "commitment": "Full-Time"},
            "workplaceType": "hybrid",
            "createdAt": 1700000000000,
        }
        result = lever._apply_extraction(raw, {"name": "TestCo", "slug": "testco"})
        assert "Rust" not in result["tech_stack"]

    def test_vue_not_matched_inside_entrevue(self, lever: Extractor) -> None:
        raw = {
            "id": "test-id",
            "text": "Software Developer",
            "hostedUrl": "https://jobs.lever.co/test/test-id",
            "description": "Entrevue avec le responsable de l'embauche.",
            "lists": [],
            "categories": {"location": "Montreal, QC", "commitment": "Full-Time"},
            "workplaceType": "hybrid",
            "createdAt": 1700000000000,
        }
        result = lever._apply_extraction(raw, {"name": "TestCo", "slug": "testco"})
        assert "Vue" not in result["tech_stack"]

    def test_lists_content_contributes_to_tech_stack(self, lever: Extractor) -> None:
        """Tech mentioned only in a Lever list section must be detected."""
        raw = {
            "id": "test-id",
            "text": "Backend Developer",
            "hostedUrl": "https://jobs.lever.co/test/test-id",
            "description": "<div>Join our team!</div>",
            "lists": [
                {
                    "text": "What we're looking for",
                    "content": (
                        "<ul><li>Strong Python expertise</li>"
                        "<li>Experience with PostgreSQL</li></ul>"
                    ),
                }
            ],
            "categories": {"location": "Montreal, QC", "commitment": "Full-Time"},
            "workplaceType": "hybrid",
            "createdAt": 1700000000000,
        }
        result = lever._apply_extraction(raw, {"name": "TestCo", "slug": "testco"})
        assert "Python" in result["tech_stack"], "Python from lists[] must be detected"
        assert "PostgreSQL" in result["tech_stack"], "PostgreSQL from lists[] must be detected"

    def test_html_attributes_do_not_trigger_false_positives(self, lever: Extractor) -> None:
        """HTML attributes like data-path-to-node must not trigger Node.js."""
        raw = {
            "id": "test-id",
            "text": "Software Engineer",
            "hostedUrl": "https://jobs.lever.co/test/test-id",
            "description": (
                '<p data-path-to-node="0"><strong data-path-to-node="0">Description</strong></p>'
                '<p data-path-to-node="1">We build payment systems in Java.</p>'
            ),
            "lists": [],
            "categories": {"location": "Montreal, QC", "commitment": "Full-Time"},
            "workplaceType": "hybrid",
            "createdAt": 1700000000000,
        }
        result = lever._apply_extraction(raw, {"name": "TestCo", "slug": "testco"})
        assert "Node.js" not in result["tech_stack"], (
            "data-path-to-node HTML attributes must not trigger Node.js extraction."
        )
        assert "Java" in result["tech_stack"]
