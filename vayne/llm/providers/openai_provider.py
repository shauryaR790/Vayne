"""OpenAI GPT analyst provider — streaming via Responses API."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI

from vayne.llm.config import (
    llm_api_key,
    llm_max_output_tokens,
    llm_model,
)
from vayne.llm.provider import LLMProvider

logger = logging.getLogger(__name__)


@dataclass
class TokenUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class OpenAIProvider(LLMProvider):
    def __init__(self) -> None:
        key = llm_api_key()
        self.client = AsyncOpenAI(api_key=key) if key else None
        self.model = llm_model()
        self.last_usage = TokenUsage()

    async def ping(self) -> bool:
        if not self.client:
            return False
        try:
            # Retrieve configured model — faster than listing all models.
            await asyncio.wait_for(self.client.models.retrieve(self.model), timeout=8.0)
            return True
        except Exception:
            return False

    def _input_messages(self, prompt: str, system: str | None) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return messages

    def _capture_usage(self, response: Any) -> TokenUsage:
        usage = getattr(response, "usage", None)
        if not usage:
            return TokenUsage()
        prompt = int(getattr(usage, "input_tokens", 0) or getattr(usage, "prompt_tokens", 0) or 0)
        completion = int(
            getattr(usage, "output_tokens", 0) or getattr(usage, "completion_tokens", 0) or 0
        )
        total = int(getattr(usage, "total_tokens", 0) or prompt + completion)
        self.last_usage = TokenUsage(
            prompt_tokens=prompt,
            completion_tokens=completion,
            total_tokens=total,
        )
        return self.last_usage

    async def generate(
        self,
        prompt: str,
        system: str | None = None,
        temperature: float = 0.7,
        *,
        max_tokens: int | None = None,
    ) -> str:
        if not self.client:
            raise RuntimeError("VAYNE_LLM_API_KEY is not configured")

        max_out = max_tokens if max_tokens is not None else llm_max_output_tokens()
        response = await self.client.responses.create(
            model=self.model,
            input=self._input_messages(prompt, system),
            max_output_tokens=max_out,
            temperature=temperature,
        )
        self._capture_usage(response)
        return response.output_text or ""

    async def stream_generate(
        self,
        prompt: str,
        system: str | None = None,
        temperature: float = 0.7,
        *,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        if not self.client:
            raise RuntimeError("VAYNE_LLM_API_KEY is not configured")

        max_out = max_tokens if max_tokens is not None else llm_max_output_tokens()
        self.last_usage = TokenUsage()

        stream = await self.client.responses.create(
            model=self.model,
            input=self._input_messages(prompt, system),
            max_output_tokens=max_out,
            temperature=temperature,
            stream=True,
        )

        final_response = None
        async for event in stream:
            etype = getattr(event, "type", "")
            if etype == "response.output_text.delta":
                delta = getattr(event, "delta", "") or ""
                if delta:
                    yield delta
            elif etype == "response.completed":
                final_response = getattr(event, "response", None)

        if final_response is not None:
            self._capture_usage(final_response)
            logger.info(
                "openai usage model=%s prompt=%s completion=%s",
                self.model,
                self.last_usage.prompt_tokens,
                self.last_usage.completion_tokens,
            )
