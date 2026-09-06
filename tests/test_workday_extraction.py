"""Tests for Workday Layer-1 extraction (issue #74).

Covers:
  1. Core field mapping — all canonical fields are populated correctly.
  2. Tech stack extraction from description_html (same regression pattern as issue #56).
  3. is_qc derivation from Workday's locationsText format.
  4. Title-only fallback when description_html is absent (failed detail fetch).
  5. Word-boundary safety in description content.
  6. Async detail-fetch: injection, HTTP errors, network errors.
  7. Existing sources (Greenhouse, Lever, Workable) are unaffected — schema still loads.

Fixture: tests/fixtures/workday_fixture_swe_raw.json
  A fictional "Fixture Corp" Software Engineer posting whose technologies
  (Python, FastAPI, PostgreSQL, Docker, AWS, Kubernetes, GitHub Actions) appear
  only in the description — not in the title.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from pipeline.extractor import Extractor, _normalize_workday_date

FIXTURES = Path(__file__).parent / "fixtures"

_COMPANY = {
    "name": "Fixture Corp",
    "slug": "fixture-corp",
    "api_url": "https://fixturecorp.wd3.myworkdayjobs.com/wday/cxs/fixturecorp/FixtureCareers/jobs",
    "base_url": "https://fixturecorp.wd3.myworkdayjobs.com",
}


@pytest.fixture(scope="module")
def workday() -> Extractor:
    return Extractor("workday")


@pytest.fixture(scope="module")
def swe_raw() -> dict:
    return json.loads((FIXTURES / "workday_fixture_swe_raw.json").read_text())


# ─── Core field mapping ───────────────────────────────────────────────────────


class TestWorkdayFieldMapping:
    """All canonical fields must be correctly populated from the enriched raw dict."""

    def test_source_constant(self, workday: Extractor, swe_raw: dict) -> None:
        result = workday._apply_extraction(swe_raw, _COMPANY)
        assert result["source"] == "workday"

    def test_is_active_constant(self, workday: Extractor, swe_raw: dict) -> None:
        result = workday._apply_extraction(swe_raw, _COMPANY)
        assert result["is_active"] is True

    def test_company_from_schema(self, workday: Extractor, swe_raw: dict) -> None:
        result = workday._apply_extraction(swe_raw, _COMPANY)
        assert result["company"] == "Fixture Corp"
        assert result["company_slug"] == "fixture-corp"

    def test_title(self, workday: Extractor, swe_raw: dict) -> None:
        result = workday._apply_extraction(swe_raw, _COMPANY)
        assert result["title"] == "Software Engineer, Backend"

    def test_external_id(self, workday: Extractor, swe_raw: dict) -> None:
        result = workday._apply_extraction(swe_raw, _COMPANY)
        assert result["external_id"] == "JR-00001"

    def test_source_url(self, workday: Extractor, swe_raw: dict) -> None:
        result = workday._apply_extraction(swe_raw, _COMPANY)
        assert "fixturecorp.wd3.myworkdayjobs.com" in result["source_url"]
        assert "JR-00001" in result["source_url"]

    def test_location(self, workday: Extractor, swe_raw: dict) -> None:
        result = workday._apply_extraction(swe_raw, _COMPANY)
        assert result["location"] == "Montréal, Quebec, Canada"

    def test_posted_at(self, workday: Extractor, swe_raw: dict) -> None:
        result = workday._apply_extraction(swe_raw, _COMPANY)
        assert result["posted_at"] is not None
        assert "2026-04-28" in result["posted_at"]

    def test_description_html_populated(self, workday: Extractor, swe_raw: dict) -> None:
        result = workday._apply_extraction(swe_raw, _COMPANY)
        assert result["description_html"] is not None
        assert "Python" in result["description_html"]

    def test_no_enriched_tech_stack(self, workday: Extractor, swe_raw: dict) -> None:
        """Layer 1 must never write enriched_tech_stack."""
        result = workday._apply_extraction(swe_raw, _COMPANY)
        assert "enriched_tech_stack" not in result


# ─── Tech extraction from description ────────────────────────────────────────


class TestWorkdayTechExtraction:
    """Technologies in description_html must be extracted into tech_stack."""

    def test_techs_in_description_extracted(self, workday: Extractor, swe_raw: dict) -> None:
        result = workday._apply_extraction(swe_raw, _COMPANY)
        stack = set(result["tech_stack"])
        # All of these appear in description_html, not in the title
        expected = {
            "Python", "FastAPI", "PostgreSQL", "Docker",
            "AWS", "Kubernetes", "GitHub Actions",
        }
        missing = expected - stack
        assert not missing, (
            f"Technologies from description_html are missing from tech_stack: {missing}. "
            "The detail-page content must flow into keyword extraction."
        )

    def test_tech_stack_is_list(self, workday: Extractor, swe_raw: dict) -> None:
        result = workday._apply_extraction(swe_raw, _COMPANY)
        assert isinstance(result["tech_stack"], list)
        assert len(result["tech_stack"]) > 0


# ─── QC and remote derivation ─────────────────────────────────────────────────


class TestWorkdayDerivedFields:
    def test_is_qc_montreal(self, workday: Extractor, swe_raw: dict) -> None:
        result = workday._apply_extraction(swe_raw, _COMPANY)
        assert result["is_qc"] is True

    def test_not_qc_toronto(self, workday: Extractor) -> None:
        raw = {**_base_raw(), "locationsText": "Toronto, Ontario, Canada"}
        result = workday._apply_extraction(raw, _COMPANY)
        assert result["is_qc"] is False

    def test_is_remote_none_for_onsite(self, workday: Extractor, swe_raw: dict) -> None:
        result = workday._apply_extraction(swe_raw, _COMPANY)
        # No remote/hybrid keyword in locationsText → null
        assert result["is_remote"] is None

    def test_is_remote_true(self, workday: Extractor) -> None:
        raw = {**_base_raw(), "locationsText": "Remote"}
        result = workday._apply_extraction(raw, _COMPANY)
        assert result["is_remote"] is True

    def test_is_remote_null_for_hybrid(self, workday: Extractor) -> None:
        raw = {**_base_raw(), "locationsText": "Montréal, Quebec, Canada (Hybrid)"}
        result = workday._apply_extraction(raw, _COMPANY)
        assert result["is_remote"] is None

    def test_seniority_senior(self, workday: Extractor) -> None:
        raw = {**_base_raw(), "title": "Senior Python Developer"}
        result = workday._apply_extraction(raw, _COMPANY)
        assert result["seniority"] == "senior"

    def test_seniority_null_for_untagged(self, workday: Extractor, swe_raw: dict) -> None:
        result = workday._apply_extraction(swe_raw, _COMPANY)
        assert result["seniority"] is None


# ─── Fallback: no description_html ───────────────────────────────────────────


class TestWorkdayDescriptionFallback:
    """When description_html is absent (failed detail fetch) the job must survive."""

    def test_title_only_fallback(self, workday: Extractor) -> None:
        raw = {
            "title": "Senior Python Developer",
            "externalPath": "/FixtureCareers/job/Montreal/Senior-Python-Developer_JR-99999",
            "locationsText": "Montréal, Quebec, Canada",
            "jobReqId": "JR-99999",
            "_external_id": "JR-99999",
            "_source_url": "https://fixturecorp.wd3.myworkdayjobs.com/FixtureCareers/job/Montreal/Senior-Python-Developer_JR-99999",
            # description_html intentionally absent
        }
        result = workday._apply_extraction(raw, _COMPANY)
        assert result["description_html"] is None, "Fallback constant must be null"
        assert "Python" in result["tech_stack"], "Python from title must still be extracted"

    def test_explicit_null_description_no_crash(self, workday: Extractor) -> None:
        raw = {**_base_raw(), "description_html": None}
        result = workday._apply_extraction(raw, _COMPANY)
        assert isinstance(result["tech_stack"], list)


# ─── Word-boundary safety ─────────────────────────────────────────────────────


class TestWorkdayWordBoundaries:
    def test_rust_not_matched_in_trust(self, workday: Extractor) -> None:
        raw = {**_base_raw(), "description_html": "We trust our teams to deliver quality."}
        result = workday._apply_extraction(raw, _COMPANY)
        assert "Rust" not in result["tech_stack"]

    def test_java_not_matched_in_javascript(self, workday: Extractor) -> None:
        raw = {**_base_raw(), "description_html": "You will use JavaScript and TypeScript."}
        result = workday._apply_extraction(raw, _COMPANY)
        assert "Java" not in result["tech_stack"]
        assert "JavaScript" in result["tech_stack"]
        assert "TypeScript" in result["tech_stack"]


# ─── Date normalization ───────────────────────────────────────────────────────


class TestNormalizeWorkdayDate:
    def test_mm_dd_yyyy(self) -> None:
        result = _normalize_workday_date("04/28/2026")
        assert result is not None
        assert "2026-04-28" in result

    def test_iso_no_tz(self) -> None:
        result = _normalize_workday_date("2026-04-28T00:00:00")
        assert result is not None
        assert "2026-04-28" in result

    def test_iso_with_offset(self) -> None:
        result = _normalize_workday_date("2026-04-28T12:00:00-04:00")
        assert result is not None
        assert "2026-04-28" in result

    def test_invalid_returns_none(self) -> None:
        assert _normalize_workday_date("not-a-date") is None

    def test_empty_returns_none(self) -> None:
        assert _normalize_workday_date("") is None


# ─── Async: _fetch_workday_descriptions ──────────────────────────────────────


class TestFetchWorkdayDescriptions:
    """Unit tests for the async detail-fetch method (no real HTTP calls)."""

    @pytest.mark.asyncio
    async def test_description_and_date_injected(self, workday: Extractor) -> None:
        raw_job: dict = {
            "externalPath": "/FixtureCareers/job/Montreal/Engineer_JR-001",
            "_api_base": "https://fixturecorp.wd3.myworkdayjobs.com/wday/cxs/fixturecorp/FixtureCareers",
            "_base_url": "https://fixturecorp.wd3.myworkdayjobs.com",
        }
        detail_response = {
            "jobPostingInfo": {
                "jobDescription": "<p>We use Python and Docker.</p>",
                "startDate": "2026-04-28T00:00:00",
            }
        }
        mock_resp = MagicMock()
        mock_resp.json.return_value = detail_response
        mock_resp.content = b"..."
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        await workday._fetch_workday_descriptions(mock_client, [raw_job])

        assert raw_job["description_html"] == "<p>We use Python and Docker.</p>"
        assert raw_job.get("_posted_at") is not None
        assert "2026-04-28" in raw_job["_posted_at"]
        # Context keys must be cleaned up
        assert "_api_base" not in raw_job
        assert "_base_url" not in raw_job

    @pytest.mark.asyncio
    async def test_detail_url_construction(self, workday: Extractor) -> None:
        """Detail URL strips site prefix from externalPath (no /details suffix).

        Real Workday tenants expose job data at the path-only URL, not at a
        separate /details endpoint.  The site prefix in externalPath (if present)
        is stripped so the path starts with /job/…
        """
        raw_job: dict = {
            "externalPath": "/FixtureCareers/job/Montreal/Engineer_JR-001",
            "_api_base": "https://fixturecorp.wd3.myworkdayjobs.com/wday/cxs/fixturecorp/FixtureCareers",
            "_base_url": "https://fixturecorp.wd3.myworkdayjobs.com",
        }
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"jobPostingInfo": {"jobDescription": "desc"}}
        mock_resp.content = b"desc"
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        await workday._fetch_workday_descriptions(mock_client, [raw_job])

        expected_url = (
            "https://fixturecorp.wd3.myworkdayjobs.com/wday/cxs/fixturecorp/FixtureCareers"
            "/job/Montreal/Engineer_JR-001"
        )
        mock_client.get.assert_awaited_once_with(expected_url, timeout=30.0)

    @pytest.mark.asyncio
    async def test_http_error_does_not_raise(self, workday: Extractor) -> None:
        import httpx

        raw_job: dict = {
            "externalPath": "/FixtureCareers/job/Montreal/Engineer_JR-002",
            "_api_base": "https://fixturecorp.wd3.myworkdayjobs.com/wday/cxs/fixturecorp/FixtureCareers",
            "_base_url": "https://fixturecorp.wd3.myworkdayjobs.com",
        }
        mock_request = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 404

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(
            side_effect=httpx.HTTPStatusError("404", request=mock_request, response=mock_response)
        )

        await workday._fetch_workday_descriptions(mock_client, [raw_job])

        assert "description_html" not in raw_job
        assert "_posted_at" not in raw_job

    @pytest.mark.asyncio
    async def test_network_error_does_not_raise(self, workday: Extractor) -> None:
        import httpx

        raw_job: dict = {
            "externalPath": "/FixtureCareers/job/Montreal/Engineer_JR-003",
            "_api_base": "https://fixturecorp.wd3.myworkdayjobs.com/wday/cxs/fixturecorp/FixtureCareers",
            "_base_url": "https://fixturecorp.wd3.myworkdayjobs.com",
        }
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("timeout"))

        await workday._fetch_workday_descriptions(mock_client, [raw_job])

        assert "description_html" not in raw_job

    @pytest.mark.asyncio
    async def test_missing_external_path_skipped(self, workday: Extractor) -> None:
        raw_job: dict = {
            "title": "Engineer",
            "externalPath": "",
            "_api_base": "https://fixturecorp.wd3.myworkdayjobs.com/wday/cxs/fixturecorp/FixtureCareers",
            "_base_url": "https://fixturecorp.wd3.myworkdayjobs.com",
        }
        mock_client = AsyncMock()

        await workday._fetch_workday_descriptions(mock_client, [raw_job])

        mock_client.get.assert_not_awaited()
        assert "description_html" not in raw_job

    @pytest.mark.asyncio
    async def test_null_jobdescription_stored_as_none(self, workday: Extractor) -> None:
        """jobDescription: null in the detail response must be stored as Python None."""
        raw_job: dict = {
            "externalPath": "/FixtureCareers/job/Montreal/Engineer_JR-004",
            "_api_base": "https://fixturecorp.wd3.myworkdayjobs.com/wday/cxs/fixturecorp/FixtureCareers",
            "_base_url": "https://fixturecorp.wd3.myworkdayjobs.com",
        }
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"jobPostingInfo": {"jobDescription": None}}
        mock_resp.content = b""
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        await workday._fetch_workday_descriptions(mock_client, [raw_job])

        assert raw_job.get("description_html") is None


# ─── Existing sources unaffected ─────────────────────────────────────────────


class TestExistingSourcesUnaffected:
    """Ensure Workday changes don't break Greenhouse, Lever, or Workable schemas."""

    def test_greenhouse_schema_loads(self) -> None:
        ex = Extractor("greenhouse")
        assert ex.source == "greenhouse"

    def test_lever_schema_loads(self) -> None:
        ex = Extractor("lever")
        assert ex.source == "lever"

    def test_workable_schema_loads(self) -> None:
        ex = Extractor("workable")
        assert ex.source == "workable"


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _base_raw() -> dict:
    """Minimal valid raw Workday job dict with injected context fields."""
    return {
        "title": "Software Engineer",
        "externalPath": "/FixtureCareers/job/Montreal/Software-Engineer_JR-00001",
        "locationsText": "Montréal, Quebec, Canada",
        "jobReqId": "JR-00001",
        "_external_id": "JR-00001",
        "_source_url": "https://fixturecorp.wd3.myworkdayjobs.com/FixtureCareers/job/Montreal/Software-Engineer_JR-00001",
    }
