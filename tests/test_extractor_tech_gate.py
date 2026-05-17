"""Tests for the is_non_tech_title gate in pipeline/extractor.py.

Verifies that non-tech roles get tech_stack=[] from the rule-based extractor,
preventing daily fetch from re-polluting the column after enricher cleanup.
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
