"""LLM provider configuration from environment."""

from __future__ import annotations

import os


def llm_provider_name() -> str:
    return os.getenv("VAYNE_LLM_PROVIDER", "openai").strip().lower()


def llm_api_key() -> str:
    return os.getenv("VAYNE_LLM_API_KEY", "").strip()


def llm_model() -> str:
    return os.getenv("VAYNE_LLM_MODEL", "gpt-4.1-mini")


def llm_temperature() -> float:
    return float(os.getenv("VAYNE_LLM_TEMPERATURE", "0.7"))


def llm_max_output_tokens() -> int:
    return int(os.getenv("VAYNE_LLM_MAX_OUTPUT_TOKENS", "800"))


def llm_max_context_chars() -> int:
    return int(os.getenv("VAYNE_LLM_MAX_CONTEXT_CHARS", "10000"))


def llm_input_cost_per_m() -> float:
    """USD per 1M input tokens (override for accurate billing display)."""
    return float(os.getenv("VAYNE_LLM_INPUT_COST_PER_M", "0.40"))


def llm_output_cost_per_m() -> float:
    """USD per 1M output tokens (override for accurate billing display)."""
    return float(os.getenv("VAYNE_LLM_OUTPUT_COST_PER_M", "1.60"))
