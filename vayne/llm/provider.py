"""LLM provider abstraction — analyst assistant only."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from pathlib import Path

_PROMPT_PATH = Path(__file__).resolve().parent / "prompts" / "analyst.txt"


def load_analyst_system_prompt() -> str:
    if _PROMPT_PATH.exists():
        return _PROMPT_PATH.read_text(encoding="utf-8").strip()
    return "You are VAYNE, a senior security analyst who explains investigation results only."


class LLMProvider(ABC):
    """Provider interface for the VAYNE analyst assistant."""

    @abstractmethod
    async def ping(self) -> bool:
        """Return True if the LLM backend is reachable."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system: str | None = None,
        temperature: float = 0.7,
        *,
        max_tokens: int | None = None,
    ) -> str:
        ...

    @abstractmethod
    async def stream_generate(
        self,
        prompt: str,
        system: str | None = None,
        temperature: float = 0.7,
        *,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        if False:  # pragma: no cover
            yield ""
        raise NotImplementedError

    async def warmup(self) -> None:
        return
