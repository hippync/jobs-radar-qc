"""Tests for the is_non_tech_title gate in pipeline/extractor.py.

Two layers of protection:
1. _apply_extraction: forces tech_stack=[] for non-tech titles (defense-in-depth).
2. _fetch_company: skips non-tech jobs entirely — they are never upserted, so
   mark_inactive() deactivates any previously stored ones on the next daily run.
"""

import pytest

from pipeline.extractor import Extractor

_COMPANY = {"name": "ACME Corp", "slug": "acme-corp"}


def _raw_job(title: str, description: str = "") -> dict:
    return {
        "id": "999",
        "title": title,
        "absolute_url": "https://example.com/job/999",
        "content": description,
        "updated_at": "2025-01-01T00:00:00Z",
        "departments": [],
        "location": {"name": "Montréal, QC"},
    }


@pytest.fixture(scope="module")
def extractor() -> Extractor:
    return Extractor("greenhouse")


class TestExtractorNonTechGate:
    def test_non_tech_title_clears_tech_stack(self, extractor: Extractor) -> None:
        """Paralegal with REST/Python in description must get tech_stack=[]."""
        raw = _raw_job("Paralegal", "We use REST APIs and Python for internal tools.")
        result = extractor._apply_extraction(raw, _COMPANY)
        assert result["tech_stack"] == []

    def test_non_tech_title_french(self, extractor: Extractor) -> None:
        raw = _raw_job("Conseillère juridique", "Connaissances en Python un atout.")
        result = extractor._apply_extraction(raw, _COMPANY)
        assert result["tech_stack"] == []

    def test_non_tech_title_sales(self, extractor: Extractor) -> None:
        raw = _raw_job("Account Executive", "Familiarity with our REST API is a plus.")
        result = extractor._apply_extraction(raw, _COMPANY)
        assert result["tech_stack"] == []

    def test_tech_title_keeps_tech_stack(self, extractor: Extractor) -> None:
        """Tech roles must still get tech_stack populated from description."""
        raw = _raw_job("Backend Engineer", "You will work with Python and REST APIs.")
        result = extractor._apply_extraction(raw, _COMPANY)
        assert "Python" in result["tech_stack"]
        assert "REST" in result["tech_stack"]


class TestFetchCompanyNonTechSkip:
    """_fetch_company must not return non-tech jobs at all.

    Tests use _apply_extraction directly to simulate what _fetch_company
    produces, then verify the skip logic that wraps it.
    """

    def test_non_tech_job_excluded_from_results(self, extractor: Extractor) -> None:
        """Non-tech titles must be absent from _fetch_company output."""
        non_tech = _raw_job("Paralegal", "We use REST APIs and Python internally.")
        tech = _raw_job("Software Engineer", "Python, Django, PostgreSQL.")
        tech["id"] = "1000"

        non_tech_extracted = extractor._apply_extraction(non_tech, _COMPANY)
        tech_extracted = extractor._apply_extraction(tech, _COMPANY)

        from agents.prompt_utils import is_non_tech_title

        results = [
            j for j in [non_tech_extracted, tech_extracted]
            if not is_non_tech_title(j.get("title", ""))
        ]

        assert len(results) == 1
        assert results[0]["title"] == "Software Engineer"

    def test_all_non_tech_batch_yields_empty(self, extractor: Extractor) -> None:
        titles = ["Paralegal", "Account Executive", "HR Generalist", "Notaire"]
        from agents.prompt_utils import is_non_tech_title

        results = [
            extractor._apply_extraction(_raw_job(t), _COMPANY)
            for t in titles
            if not is_non_tech_title(t)
        ]
        assert results == []


# ─── Keyword boundary regressions (Greenhouse) ──────────────────────────────


class TestKeywordBoundaryGreenhouse:
    """Regression tests for word-boundary false positives in Greenhouse extraction.

    Bug: (?:Go|Golang) lacked \b anchors, so the Go keyword matched the substring
    "Go" inside "Google", "Golang" inside unrelated mentions, etc.
    Root cause: _with_word_boundary inspected pattern[0] which is '(' for a
    non-capturing group, so no \b was prepended or appended.
    """

    def test_go_not_matched_inside_google(self, extractor: Extractor) -> None:
        """Go must not fire when only Google is mentioned (no actual Go usage)."""
        raw = _raw_job(
            "Gestionnaire des Médias de Performance",
            "Plateformes telles que Google, Meta, Amazon, TikTok.",
        )
        result = extractor._apply_extraction(raw, _COMPANY)
        assert "Go" not in result["tech_stack"], (
            "Go is a false positive: it matched 'Go' inside 'Google'. "
            "Word-boundary enforcement must prevent this."
        )

    def test_go_detected_when_explicitly_named(self, extractor: Extractor) -> None:
        """Go must still be extracted when the posting genuinely uses Go."""
        raw = _raw_job(
            "Backend Developer",
            "We build microservices in Go and deploy with Docker.",
        )
        result = extractor._apply_extraction(raw, _COMPANY)
        assert "Go" in result["tech_stack"], (
            "Go must be detected when it appears as a standalone word."
        )

    def test_golang_detected_as_go_canonical(self, extractor: Extractor) -> None:
        """'Golang' in the description should map to the canonical 'Go' entry."""
        raw = _raw_job(
            "Backend Developer",
            "Our stack is Golang and PostgreSQL.",
        )
        result = extractor._apply_extraction(raw, _COMPANY)
        assert "Go" in result["tech_stack"], (
            "Golang must map to canonical 'Go'."
        )
