"""Tests for agents.prompt_utils.compute_prompt_hash and render_system_prompt."""

import json
from pathlib import Path

from agents.prompt_utils import compute_prompt_hash, render_system_prompt

_PROMPT_PATH = Path(__file__).parent.parent / "agents" / "prompts" / "tech_extraction.md"
_CANONICAL_PATH = Path(__file__).parent.parent / "core" / "canonical_tech_stack.json"


class TestComputePromptHash:
    def test_hash_is_eight_hex_chars(self):
        h = compute_prompt_hash()
        assert len(h) == 8
        assert all(c in "0123456789abcdef" for c in h)

    def test_hash_is_stable_across_calls(self):
        assert compute_prompt_hash() == compute_prompt_hash()

    def test_hash_changes_when_prompt_content_changes(self, tmp_path, monkeypatch):
        original = compute_prompt_hash()

        modified_prompt = _PROMPT_PATH.read_text() + "\n<!-- change -->"
        tmp_prompt = tmp_path / "tech_extraction.md"
        tmp_prompt.write_text(modified_prompt)

        import agents.prompt_utils as pu

        monkeypatch.setattr(pu, "_PROMPT_PATH", tmp_prompt)

        assert original != pu.compute_prompt_hash()

    def test_hash_changes_when_canonical_list_changes(self, tmp_path, monkeypatch):
        original = compute_prompt_hash()

        canonical = json.loads(_CANONICAL_PATH.read_text())
        canonical["categories"]["languages"].append("COBOL")
        tmp_canonical = tmp_path / "canonical_tech_stack.json"
        tmp_canonical.write_text(json.dumps(canonical))

        import agents.prompt_utils as pu

        monkeypatch.setattr(pu, "_CANONICAL_PATH", tmp_canonical)

        assert original != pu.compute_prompt_hash()


class TestRenderSystemPrompt:
    def test_placeholder_replaced(self):
        rendered = render_system_prompt()
        assert "{{canonical_tech_list}}" not in rendered

    def test_canonical_tech_present(self):
        rendered = render_system_prompt()
        assert "Python" in rendered
        assert "Kubernetes" in rendered
        assert "LangChain" in rendered  # new in v2; Temporal was removed

    def test_categories_present(self):
        rendered = render_system_prompt()
        canonical = json.loads(_CANONICAL_PATH.read_text())
        for category in canonical["categories"]:
            assert category in rendered
