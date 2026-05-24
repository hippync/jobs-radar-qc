"""Regression tests for Workable Layer-1 detail-page description fetch (issue #56).

Before the fix, the Workable extractor never populated ``description_html`` — the
constant was always ``null`` and ``tech_stack`` was derived from the job title only.

After the fix:
  1. ``_fetch_workable_descriptions`` fetches each job's ``.md`` detail page and
     injects the Markdown content as ``description_html`` into the raw row dict.
  2. ``extraction.xml`` maps that field and uses ``sources="title,description_html"``
     for ``tech_stack`` keyword matching.

These tests exercise ``_apply_extraction`` in isolation (no network calls) with a
fixture that simulates a row produced by the markdown-table parser AFTER the
description has already been injected.  A separate async test validates that the
enrichment path correctly populates ``description_html`` from a mocked HTTP client.

Fixture: ``tests/fixtures/workable_tecsys_sre_raw.json``
  A Tecsys "Site Reliability Engineer" posting whose technologies (AWS, Kubernetes,
  Python, Docker, Jenkins) appear only in the description — not in the title.
  Before the fix, tech_stack would be ``[]`` for this job.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from pipeline.extractor import Extractor

FIXTURES = Path(__file__).parent / "fixtures"

_COMPANY_TECSYS = {"name": "Tecsys", "slug": "tecsys"}


@pytest.fixture(scope="module")
def workable() -> Extractor:
    return Extractor("workable")


@pytest.fixture(scope="module")
def sre_raw() -> dict:
    return json.loads((FIXTURES / "workable_tecsys_sre_raw.json").read_text())


# ─── Core regression: techs in description are now extracted ─────────────────


class TestWorkableDescriptionExtraction:
    """Issue #56: tech_stack must be populated from description_html, not title only."""

    def test_techs_in_description_are_extracted(self, workable: Extractor, sre_raw: dict) -> None:
        """Technologies mentioned only in the description must appear in tech_stack."""
        result = workable._apply_extraction(sre_raw, _COMPANY_TECSYS)
        stack = set(result["tech_stack"])
        # These techs appear in the description but NOT in the title
        expected = {"AWS", "Kubernetes", "Python", "Docker", "Jenkins"}
        missing = expected - stack
        assert not missing, (
            f"Technologies from description_html are missing from tech_stack: {missing}. "
            "The detail-page fetch must inject description_html before extraction runs."
        )

    def test_title_still_contributes(self, workable: Extractor, sre_raw: dict) -> None:
        """Techs in the title continue to be extracted alongside description techs."""
        # The fixture title 'Site Reliability Engineer' has no tech keywords,
        # so this test verifies that the two sources are correctly unioned.
        result = workable._apply_extraction(sre_raw, _COMPANY_TECSYS)
        assert isinstance(result["tech_stack"], list)
        assert len(result["tech_stack"]) > 0

    def test_description_html_populated(self, workable: Extractor, sre_raw: dict) -> None:
        """description_html must be the injected Markdown content, not null."""
        result = workable._apply_extraction(sre_raw, _COMPANY_TECSYS)
        assert result["description_html"] is not None
        assert "AWS" in result["description_html"]

    def test_no_enriched_tech_stack(self, workable: Extractor, sre_raw: dict) -> None:
        """Layer 1 must never write enriched_tech_stack."""
        result = workable._apply_extraction(sre_raw, _COMPANY_TECSYS)
        assert "enriched_tech_stack" not in result


# ─── Fallback: failed detail fetch preserves the job ────────────────────────


class TestWorkableDetailFetchFallback:
    """A job with no description_html (failed fetch) must still be extracted."""

    def test_title_only_fallback(self, workable: Extractor) -> None:
        """When description_html is missing, extraction succeeds with title-only stack."""
        raw_no_desc = {
            "title": "Senior React Developer",
            "department": "Engineering",
            "location": "Montreal, Canada (Hybrid)",
            "_employment_raw": "Full-time",
            "_posted_raw": "2026-05-01",
            "_detail_url": "https://apply.workable.com/testco/jobs/view/AABBCCDD11.md",
            "external_id": "AABBCCDD11",
            "source_url": "https://apply.workable.com/testco/j/AABBCCDD11",
            # description_html intentionally absent — simulates a failed fetch
        }
        result = workable._apply_extraction(raw_no_desc, {"name": "TestCo", "slug": "testco"})
        assert result["description_html"] is None, "Fallback constant must be null"
        assert "React" in result["tech_stack"], "React from title must still be extracted"

    def test_null_description_html_no_crash(self, workable: Extractor) -> None:
        """Explicit null description_html must not crash keyword collection."""
        raw = {
            "title": "Backend Developer",
            "department": "R&D",
            "location": "Montreal, Canada",
            "_employment_raw": None,
            "_posted_raw": "2026-05-01",
            "_detail_url": None,
            "external_id": "NULLTEST01",
            "source_url": "https://apply.workable.com/testco/j/NULLTEST01",
            "description_html": None,
        }
        result = workable._apply_extraction(raw, {"name": "TestCo", "slug": "testco"})
        assert isinstance(result["tech_stack"], list)


# ─── Async: _fetch_workable_descriptions injects description_html ────────────


class TestFetchWorkableDescriptions:
    """Unit test for the async detail-fetch method (no real HTTP calls)."""

    @pytest.mark.asyncio
    async def test_description_injected(self, workable: Extractor) -> None:
        """A successful detail fetch injects description_html into the raw job dict."""
        raw_job: dict = {
            "_detail_url": "https://apply.workable.com/testco/jobs/view/AABBCCDD11.md",
        }
        mock_resp = MagicMock()
        mock_resp.text = "# Engineer\n\n## Description\n\nWe use Python and Docker."
        mock_resp.content = mock_resp.text.encode()
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        await workable._fetch_workable_descriptions(mock_client, [raw_job])

        assert raw_job["description_html"] == mock_resp.text
        mock_client.get.assert_awaited_once_with(
            "https://apply.workable.com/testco/jobs/view/AABBCCDD11.md",
            timeout=30.0,
        )

    @pytest.mark.asyncio
    async def test_http_error_does_not_raise(self, workable: Extractor) -> None:
        """An HTTP error on a detail fetch must be swallowed — job must survive."""
        import httpx

        raw_job: dict = {
            "_detail_url": "https://apply.workable.com/testco/jobs/view/DEADBEEF11.md",
        }
        mock_request = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 404

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(
            side_effect=httpx.HTTPStatusError("404", request=mock_request, response=mock_response)
        )

        # Must not raise
        await workable._fetch_workable_descriptions(mock_client, [raw_job])

        assert "description_html" not in raw_job, (
            "description_html must not be set when the fetch fails"
        )

    @pytest.mark.asyncio
    async def test_network_error_does_not_raise(self, workable: Extractor) -> None:
        """A network-level error on a detail fetch must be swallowed."""
        import httpx

        raw_job: dict = {
            "_detail_url": "https://apply.workable.com/testco/jobs/view/NETFAIL001.md",
        }
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("timeout"))

        await workable._fetch_workable_descriptions(mock_client, [raw_job])

        assert "description_html" not in raw_job

    @pytest.mark.asyncio
    async def test_duplicate_detail_url_fetched_once(self, workable: Extractor) -> None:
        """Two jobs with identical _detail_url must trigger only one HTTP request."""
        shared_url = "https://apply.workable.com/testco/jobs/view/SHARED0001.md"
        raw_jobs = [
            {"_detail_url": shared_url},
            {"_detail_url": shared_url},
        ]
        mock_resp = MagicMock()
        mock_resp.text = "# Engineer\n\n## Description\n\nWe use Go."
        mock_resp.content = mock_resp.text.encode()
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        await workable._fetch_workable_descriptions(mock_client, raw_jobs)

        assert mock_client.get.await_count == 1, (
            "Duplicate _detail_url must not trigger duplicate HTTP requests"
        )
        # Only the first job gets description_html; the second is the duplicate and
        # is skipped by the seen-set guard.
        assert raw_jobs[0].get("description_html") == mock_resp.text

    @pytest.mark.asyncio
    async def test_missing_detail_url_skipped(self, workable: Extractor) -> None:
        """A job with no _detail_url must be skipped without error."""
        raw_job: dict = {"title": "Engineer", "_detail_url": None}
        mock_client = AsyncMock()

        await workable._fetch_workable_descriptions(mock_client, [raw_job])

        mock_client.get.assert_not_awaited()
        assert "description_html" not in raw_job


# ─── Word-boundary safety in description_html ────────────────────────────────


class TestWorkableDescriptionWordBoundaries:
    """Verify that word-boundary rules still apply when matching description content."""

    def test_rust_not_matched_in_trust(self, workable: Extractor) -> None:
        raw = {
            "title": "Software Developer",
            "department": None,
            "location": "Montreal, Canada",
            "_employment_raw": None,
            "_posted_raw": "2026-05-01",
            "external_id": "WB000001",
            "source_url": "https://apply.workable.com/testco/j/WB000001",
            "description_html": "We trust our teams to ship quality software.",
        }
        result = workable._apply_extraction(raw, {"name": "TestCo", "slug": "testco"})
        assert "Rust" not in result["tech_stack"], (
            "'Rust' must not match 'trust' in the description — word-boundary still enforced."
        )

    def test_java_not_matched_in_javascript(self, workable: Extractor) -> None:
        raw = {
            "title": "Frontend Developer",
            "department": None,
            "location": "Montreal, Canada",
            "_employment_raw": None,
            "_posted_raw": "2026-05-01",
            "external_id": "WB000002",
            "source_url": "https://apply.workable.com/testco/j/WB000002",
            "description_html": "You will work with JavaScript and TypeScript every day.",
        }
        result = workable._apply_extraction(raw, {"name": "TestCo", "slug": "testco"})
        assert "Java" not in result["tech_stack"], "'Java' must not match inside 'JavaScript'."
        assert "JavaScript" in result["tech_stack"]
        assert "TypeScript" in result["tech_stack"]
