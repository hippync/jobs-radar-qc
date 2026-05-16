"""Tests for agents.prompt_utils.parse_llm_response and strip_html."""
import json
from pathlib import Path

import pytest

from agents.prompt_utils import parse_llm_response, strip_html

FIXTURES = json.loads(
    (Path(__file__).parent / "fixtures" / "sample_claude_response.json").read_text()
)


class TestParseLlmResponse:
    def test_canonical_only(self):
        known, unknown = parse_llm_response(FIXTURES["canonical_only"])
        assert set(known) == {"Python", "Django", "PostgreSQL", "Redis", "Celery"}
        assert unknown == []

    def test_unknown_prefix_separated(self):
        known, unknown = parse_llm_response(FIXTURES["with_unknowns"])
        assert set(known) == {"Python", "Django", "PostgreSQL"}
        assert set(unknown) == {"Temporal", "MLflow"}

    def test_markdown_fence_stripped(self):
        known, unknown = parse_llm_response(FIXTURES["markdown_fence"])
        assert set(known) == {"Go", "Kubernetes", "Docker", "gRPC"}
        assert unknown == []

    def test_empty_list(self):
        known, unknown = parse_llm_response(FIXTURES["empty_list"])
        assert known == []
        assert unknown == []

    def test_extra_whitespace_in_json(self):
        known, unknown = parse_llm_response(FIXTURES["extra_whitespace"])
        assert set(known) == {"TypeScript", "React", "Node.js"}
        assert unknown == []

    def test_malformed_no_json_raises(self):
        with pytest.raises(ValueError, match="no JSON object"):
            parse_llm_response(FIXTURES["malformed_no_json"])

    def test_malformed_wrong_key_raises(self):
        with pytest.raises(ValueError, match="'technologies' key missing"):
            parse_llm_response(FIXTURES["malformed_wrong_key"])

    def test_non_string_items_ignored(self):
        raw = '{"technologies": ["Python", 42, null, "Django"]}'
        known, unknown = parse_llm_response(raw)
        assert set(known) == {"Python", "Django"}

    def test_question_mark_stripped_from_unknown(self):
        raw = '{"technologies": ["?Temporal", "? Elixir"]}'
        known, unknown = parse_llm_response(raw)
        assert known == []
        assert set(unknown) == {"Temporal", "Elixir"}


class TestStripHtml:
    def test_basic_tags_removed(self):
        result = strip_html("<p>Hello <b>world</b></p>")
        assert result == "Hello world"

    def test_whitespace_collapsed(self):
        result = strip_html("<ul><li>Python</li>  <li>Django</li></ul>")
        assert "  " not in result
        assert "Python" in result
        assert "Django" in result

    def test_empty_string(self):
        assert strip_html("") == ""

    def test_plain_text_unchanged(self):
        result = strip_html("no html here")
        assert result == "no html here"
