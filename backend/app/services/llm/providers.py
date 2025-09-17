"""Abstraction layer for LLM providers. Start with Anthropic; leave hook for OpenAI."""
from typing import Dict, Any
import os

class AnthropicClient:
  def __init__(self):
    self.api_key = os.getenv("ANTHROPIC_API_KEY")
    # Don't hard fail here to allow local stubs

  def run(self, prompt: str) -> Dict[str, Any]:
    # TODO: call Anthropic Messages API (Sonnet 4) and return JSON result
    return {"text": "stub"}

class OpenAIClient:
  def __init__(self):
    self.api_key = os.getenv("OPENAI_API_KEY")

  def run(self, prompt: str) -> Dict[str, Any]:
    # TODO: implement if/when switching providers
    return {"text": "stub"}


def get_llm(provider: str = "anthropic"):
  return AnthropicClient() if provider == "anthropic" else OpenAIClient()

