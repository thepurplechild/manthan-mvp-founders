"""Anthropic Claude 3 Opus client integration."""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

import requests
from tenacity import RetryError, retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .schemas import AnthropicResponse

logger = logging.getLogger(__name__)

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
DEFAULT_MODEL = "claude-3-opus-20240229"


class AnthropicError(RuntimeError):
    """Raised when the Anthropic API returns an error."""


def _get_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise AnthropicError(f"Missing required environment variable: {name}")
    return value


def _build_headers(api_key: str) -> Dict[str, str]:
    return {
        "x-api-key": api_key,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
    }


class _RetryableHTTPError(AnthropicError):
    """Marker exception for retryable HTTP failures."""


@retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type(_RetryableHTTPError),
)
def _post_with_retry(payload: Dict[str, Any], headers: Dict[str, str]) -> Dict[str, Any]:
    response = requests.post(ANTHROPIC_URL, json=payload, headers=headers, timeout=30)
    if response.status_code >= 500 or response.status_code == 429:
        raise _RetryableHTTPError(f"Anthropic transient error {response.status_code}: {response.text}")
    if response.status_code >= 400:
        raise AnthropicError(f"Anthropic error {response.status_code}: {response.text}")
    return response.json()


def generate(
    op: str,
    system_prompt: str,
    user_prompt: str,
    *,
    model_env: Optional[str] = None,
    max_tokens: int = 2048,
    temperature: float = 0.2,
) -> str:
    """Call Anthropic Claude 3 Opus and return the generated text."""

    api_key = _get_env("ANTHROPIC_API_KEY")
    model = model_env or os.getenv("ANTHROPIC_MODEL", DEFAULT_MODEL)
    headers = _build_headers(api_key)
    payload: Dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system_prompt,
        "messages": [
            {
                "role": "user",
                "content": user_prompt,
            }
        ],
        "metadata": {
            "operation": op,
        },
    }

    try:
        raw = _post_with_retry(payload, headers)
    except RetryError as exc:  # pragma: no cover - defensive
        raise AnthropicError(f"Anthropic request failed after retries: {exc}") from exc

    response = AnthropicResponse.model_validate(raw)
    texts = []
    for item in response.content:
        if isinstance(item, dict) and item.get("type") == "text":
            texts.append(item.get("text", ""))
    result = "\n".join(part for part in texts if part)
    logger.debug("Anthropic op=%s produced %d chars", op, len(result))
    return result.strip()
