"""Packaging agent processing pipeline."""
from __future__ import annotations

import json
import logging
import textwrap
from typing import Any, Dict, Optional

from . import anthropic_client, docx_utils, supabase_client

logger = logging.getLogger(__name__)

PREPROCESS_MAX_CHARS = 200_000


def _format_mandates(mandates: Optional[Dict[str, Any]]) -> str:
    if not mandates:
        return "No explicit mandates provided."
    try:
        return json.dumps(mandates, indent=2, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(mandates)


def preprocess(raw_text: str) -> str:
    """Normalize whitespace and guard against oversized inputs."""

    if not raw_text or not raw_text.strip():
        raise ValueError("Source script is empty")
    normalized = raw_text.replace("\r\n", "\n").replace("\r", "\n")
    normalized = "\n".join(line.rstrip() for line in normalized.splitlines())
    if len(normalized) > PREPROCESS_MAX_CHARS:
        logger.warning("Truncating script from %d to %d characters", len(normalized), PREPROCESS_MAX_CHARS)
        normalized = normalized[:PREPROCESS_MAX_CHARS]
    return normalized.strip()


def extract(cleaned_text: str, mandates: Optional[Dict[str, Any]]) -> str:
    """Extract key narrative elements using Anthropic."""

    system_prompt = textwrap.dedent(
        """
        You are a senior story analyst compiling a structured breakdown of creative material for production packaging.
        Provide concise, production-ready analysis with clear bullet sections.
        """
    ).strip()
    user_prompt = textwrap.dedent(
        f"""
        Script Content:
        ---
        {cleaned_text}
        ---

        Mandates:
        { _format_mandates(mandates) }

        Task: Summarize the script with sections for logline, genre, tone, themes, protagonist, antagonist, supporting characters, world/setting, and episode breakdown (if serialized). Use bullet points where appropriate.
        """
    ).strip()
    return anthropic_client.generate("extraction", system_prompt, user_prompt, max_tokens=1600, temperature=0.1)


def build_character_bible(extraction: str, mandates: Optional[Dict[str, Any]]) -> str:
    """Generate a concise character bible informed by extraction and mandates."""

    system_prompt = textwrap.dedent(
        """
        You compile character bibles for packaging decks. Be precise and actionable for casting teams.
        """
    ).strip()
    user_prompt = textwrap.dedent(
        f"""
        Extraction Summary:
        ---
        {extraction}
        ---

        Mandates:
        {_format_mandates(mandates)}

        Produce a character bible with entries formatted as:
        - Name:
          - Role/Function
          - Key Traits
          - Casting Notes
          - Mandate Fit
        Include only the most critical characters.
        """
    ).strip()
    return anthropic_client.generate("character_bible", system_prompt, user_prompt, max_tokens=1200, temperature=0.2)


def adapt_content(extraction: str, character_bible: str, mandates: Optional[Dict[str, Any]]) -> str:
    """Adapt content into packaging-friendly copy while respecting mandates."""

    system_prompt = textwrap.dedent(
        """
        You craft pitch-ready packaging copy for film/TV projects that aligns with buyer mandates.
        Maintain professional tone, highlight differentiators, and keep sections skimmable.
        """
    ).strip()
    user_prompt = textwrap.dedent(
        f"""
        Extraction Summary:
        ---
        {extraction}
        ---

        Character Bible:
        ---
        {character_bible}
        ---

        Mandates:
        {_format_mandates(mandates)}

        Deliver sections titled: Key Takeaways, Why It Wins Now, Audience & Platform Fit, Packaging Recommendations.
        Each section should be 2-3 tight paragraphs or bullet lists.
        """
    ).strip()
    return anthropic_client.generate("adaptation", system_prompt, user_prompt, max_tokens=1500, temperature=0.25)


def assemble_docx(project_id: str, sections: Dict[str, str]) -> bytes:
    """Assemble DOCX bytes from pipeline sections."""

    return docx_utils.assemble_docx(project_id, sections)


def run_pipeline(project_id: str, mandates: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Run the full packaging pipeline and return sections plus docx bytes."""

    raw_text = supabase_client.download_script(project_id)
    cleaned = preprocess(raw_text)
    extraction = extract(cleaned, mandates)
    bible = build_character_bible(extraction, mandates)
    adaptation = adapt_content(extraction, bible, mandates)
    sections = {
        "preprocessing": cleaned,
        "extraction": extraction,
        "character_bible": bible,
        "adaptation": adaptation,
        "assembly_text": adaptation,
    }
    docx_bytes = assemble_docx(project_id, {
        "Overview": adaptation,
        "Script Summary": extraction,
        "Character Bible": bible,
    })
    return {
        "sections": sections,
        "docx_bytes": docx_bytes,
    }
