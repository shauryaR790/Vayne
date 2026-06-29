"""Instantiate the configured LLM provider."""

from __future__ import annotations

from vayne.llm.config import llm_provider_name
from vayne.llm.provider import LLMProvider
from vayne.llm.providers.openai_provider import OpenAIProvider

_provider: LLMProvider | None = None


def get_llm_provider() -> LLMProvider:
    global _provider
    name = llm_provider_name()
    if _provider is not None and name == "openai":
        # Re-read key so a .env load after first import still works on reload.
        from vayne.llm.config import llm_api_key
        if not llm_api_key():
            _provider = None

    if _provider is not None:
        return _provider

    if name == "openai":
        _provider = OpenAIProvider()
        return _provider

    raise ValueError(f"Unsupported VAYNE_LLM_PROVIDER: {name}")
