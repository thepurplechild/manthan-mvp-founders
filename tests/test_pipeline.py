from __future__ import annotations

import io

import pytest
from docx import Document

from lib.packaging_agent import docx_utils, pipeline


def test_preprocess_normalizes_whitespace():
    raw = "Line one\r\nLine two   \r\n\r\n"
    cleaned = pipeline.preprocess(raw)
    assert "Line two" in cleaned
    assert "\r" not in cleaned
    assert cleaned.endswith("Line two")


def test_assemble_docx_creates_valid_document():
    sections = {
        "overview": "This is a summary.",
        "details": "More content here.",
    }
    blob = docx_utils.assemble_docx("demo-123", sections)
    assert isinstance(blob, bytes)
    assert len(blob) > 0
    Document(io.BytesIO(blob))  # Should not raise


def test_pipeline_runs_with_mocked_dependencies(monkeypatch):
    sample_script = "INT. ROOM - DAY\nCharacters speak fast."

    def fake_download(project_id: str) -> str:
        assert project_id == "demo"
        return sample_script

    outputs = {
        "extraction": "Extraction summary",
        "character_bible": "Character overview",
        "adaptation": "Adapted copy",
    }

    def fake_generate(op: str, system_prompt: str, user_prompt: str, **kwargs):
        return outputs[op]

    monkeypatch.setattr(pipeline.supabase_client, "download_script", fake_download)
    monkeypatch.setattr(pipeline.anthropic_client, "generate", fake_generate)

    result = pipeline.run_pipeline("demo", {"priority": "high"})
    sections = result["sections"]

    assert sections["extraction"] == "Extraction summary"
    assert sections["character_bible"] == "Character overview"
    assert sections["adaptation"] == "Adapted copy"
    assert isinstance(result["docx_bytes"], bytes)
    assert len(result["docx_bytes"]) > 0
