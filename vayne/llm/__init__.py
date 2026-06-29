"""VAYNE LLM layer — AI security analyst (engine remains deterministic)."""

from vayne.llm.factory import get_llm_provider
from vayne.llm.provider import LLMProvider

__all__ = ["LLMProvider", "get_llm_provider"]
