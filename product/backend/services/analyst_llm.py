"""OpenAI-backed streaming analyst for Ask VAYNE — engine facts only."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from product.backend.services.analyst_cache import (
    get_brief,
    get_cached,
    resolve_cache_key,
    save_brief,
    set_cached,
)
from product.backend.services.analyst_context import context_as_json, pack_prompt_context
from vayne.llm import get_llm_provider
from vayne.llm.config import (
    llm_api_key,
    llm_input_cost_per_m,
    llm_max_context_chars,
    llm_max_output_tokens,
    llm_model,
    llm_output_cost_per_m,
    llm_provider_name,
    llm_temperature,
)
from vayne.llm.provider import load_analyst_system_prompt
from vayne.llm.providers.openai_provider import OpenAIProvider, TokenUsage

logger = logging.getLogger(__name__)

REPORT_MODE_HINTS: dict[str, str] = {
    "executive": "Format for CEOs and management. Plain English only — no jargon without translation. Business impact and recommended actions. Use Cursor-style markdown sections.",
    "technical": "Format for SOC analysts and pentesters. Start with **In plain terms** (2–3 sentences), then technical proof (CVEs, hosts, paths, evidence). Balance clarity with depth — explain what each finding means, not just what was detected.",
    "remediation": "Format for engineers. Start with **In plain terms** (what to fix and why), then prioritized actionable steps. Use Cursor-style markdown sections.",
    "audit": "Format for compliance auditors. Plain summary first, then evidence citations and control gaps. Use Cursor-style markdown sections.",
}

PRESET_HINTS: dict[str, str] = {
    "finding": "Explain the most significant validated finding. Start with **In plain terms** (what it means in everyday language), then cite evidence.",
    "attack_chain": "Explain the validated attack chain. Start with **In plain terms** (the story of how an attacker could move), then step-by-step technical detail.",
    "rejected_chain": "Explain why attack paths were rejected. Start with **In plain terms**, then what evidence was missing.",
    "graph": "Explain the attack graph. Start with **In plain terms** (how pieces connect), then key nodes and relationships.",
    "root_cause": "Root cause analysis for the primary finding. Plain English first, then technical root cause.",
    "evidence": "What evidence supports the top finding and path. Plain summary first, then per-scanner proof.",
    "business": "Business impact if the attack path is exploited. Plain English for leadership, then specifics.",
    "next": "Recommend next actions. Plain English priorities first, then concrete steps.",
    "time_saved": "Estimate analyst time saved. Explain in human terms what manual work was skipped.",
}

OFFLINE_MESSAGE = (
    "VAYNE analyst unavailable. Deterministic investigation results remain available."
)

_ping_cache: tuple[bool, float] | None = None
_PING_TTL_SEC = 45.0


async def _llm_reachable() -> bool:
    """Cached connectivity check — avoids blocking every chat on a live API round-trip."""
    global _ping_cache
    if not llm_api_key():
        return False
    now = asyncio.get_running_loop().time()
    if _ping_cache is not None:
        ok, ts = _ping_cache
        if now - ts < _PING_TTL_SEC:
            return ok
    try:
        ok = await get_llm_provider().ping()
    except Exception:
        ok = False
    _ping_cache = (ok, now)
    return ok

BRIEF_INSTRUCTION = """Interpret this investigation for a peer analyst. Use ONLY facts from the context.

Write for humans first, specialists second.

Use Cursor-style markdown (required — not plain paragraphs):

1. **In plain terms** — 2–4 sentences in everyday language: what the scan actually found, whether it is confirmed or still needs checking, and why a human should care. No jargon without a quick translation.

2. **What happened** — numbered list (2–4 items). Each item: plain-English clause first, then `backticks` for hosts/CVEs/services.

3. **Why VANE believes it** — bullets; explain what the evidence means, not just scanner names.

4. **How certain** — one short paragraph in words (e.g. "moderately confident because…"), then optional scores. Never lead with percentages alone.

5. **Next steps** — bullets; concrete actions anyone can follow.

Section titles on their own line — use each title once. Do not repeat titles or embed "What happened:" inside body text.
Use **bold** for key ideas. Use `backticks` for technical identifiers.
Never invent facts. No ALL CAPS headers or divider lines.
"""

CURSOR_FORMAT_REMINDER = (
    "OUTPUT FORMAT: Reply in Cursor-style markdown. "
    "Always start with **In plain terms** (2–4 human sentences), then technical sections. "
    "Numbered lists for what happened; `-` bullets for evidence and actions; "
    "`backticks` for hosts/CVEs. Explain what things *mean*, not just what was detected.\n\n"
)

def estimate_cost_usd(usage: TokenUsage) -> float:
    prompt_cost = (usage.prompt_tokens / 1_000_000) * llm_input_cost_per_m()
    completion_cost = (usage.completion_tokens / 1_000_000) * llm_output_cost_per_m()
    return round(prompt_cost + completion_cost, 6)


def _usage_event(usage: TokenUsage) -> dict[str, Any]:
    cost = estimate_cost_usd(usage)
    return {
        "type": "usage",
        "prompt_tokens": usage.prompt_tokens,
        "completion_tokens": usage.completion_tokens,
        "total_tokens": usage.total_tokens,
        "cost_usd": cost,
    }


def _clip_context_json(context: dict[str, Any]) -> str:
    packed = pack_prompt_context(context)
    text = context_as_json(packed)
    limit = llm_max_context_chars()
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def _build_prompt(
    context: dict[str, Any],
    user_message: str,
    history: list[dict[str, str]],
    report_mode: str | None = None,
    preset_id: str | None = None,
) -> str:
    lines = [
        "Investigation context — authoritative for anything about THIS scan "
        "(findings, hosts, services, versions, confidence, evidence, attack paths, "
        "conflicts, recommendations, per-finding investigation). Ground all "
        "scan-specific claims in it and never fabricate scan facts. For general "
        "cybersecurity questions, use your own expertise:\n",
        _clip_context_json(context),
        "\n\n",
    ]

    if history:
        lines.append("Previous chat messages:\n")
        for turn in history[-10:]:
            role = turn["role"].upper()
            content = turn["content"]
            if len(content) > 600:
                content = content[:599] + "…"
            lines.append(f"{role}: {content}\n")
        lines.append("\n")

    if report_mode and report_mode in REPORT_MODE_HINTS:
        lines.append(f"Report mode: {report_mode}\n{REPORT_MODE_HINTS[report_mode]}\n\n")

    if preset_id and preset_id in PRESET_HINTS:
        lines.append(f"Action: {PRESET_HINTS[preset_id]}\n\n")

    lines.append(CURSOR_FORMAT_REMINDER)
    lines.append(f"USER: {user_message}\n\nASSISTANT:")
    return "".join(lines)


async def _stream_cached(text: str) -> AsyncIterator[dict[str, Any]]:
    """Replay cached text in small chunks — avoids hundreds of SSE events."""
    chunk_size = 24
    for i in range(0, len(text), chunk_size):
        yield {"type": "token", "token": text[i : i + chunk_size]}
        await asyncio.sleep(0.016)


async def warmup_analyst_llm() -> None:
    await _llm_reachable()


async def analyst_status() -> dict[str, Any]:
    configured = bool(llm_api_key())
    online = await _llm_reachable() if configured else False
    return {
        "provider": llm_provider_name(),
        "model": llm_model(),
        "online": online,
        "configured": configured,
    }


async def stream_analyst_reply(
    context: dict[str, Any],
    user_message: str,
    history: list[dict[str, str]],
    report_mode: str | None = None,
    preset_id: str | None = None,
    export_dir: Path | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Yield thinking events, token events, usage, then done."""
    if not llm_api_key():
        yield {"type": "error", "code": "llm_not_configured", "message": OFFLINE_MESSAGE}
        return

    if not await _llm_reachable():
        yield {"type": "error", "code": "llm_offline", "message": OFFLINE_MESSAGE}
        return

    provider = get_llm_provider()
    cache_key = resolve_cache_key(preset_id, report_mode)
    if cache_key and export_dir:
        cached = get_cached(export_dir, cache_key)
        if cached:
            async for event in _stream_cached(cached["text"]):
                yield event
            yield {
                "type": "usage",
                "prompt_tokens": cached.get("prompt_tokens", 0),
                "completion_tokens": cached.get("completion_tokens", 0),
                "total_tokens": cached.get("prompt_tokens", 0) + cached.get("completion_tokens", 0),
                "cost_usd": cached.get("cost_usd", 0.0),
                "cached": True,
            }
            yield {"type": "done"}
            return

    system = load_analyst_system_prompt()
    prompt = _build_prompt(context, user_message, history, report_mode, preset_id)
    temperature = llm_temperature()
    max_tokens = llm_max_output_tokens()

    full_text: list[str] = []
    try:
        async for token in provider.stream_generate(
            prompt,
            system=system,
            temperature=temperature,
            max_tokens=max_tokens,
        ):
            full_text.append(token)
            yield {"type": "token", "token": token}
    except Exception as exc:
        logger.exception("analyst llm error")
        yield {"type": "error", "code": "llm_error", "message": str(exc)[:500]}
        return

    usage = TokenUsage()
    if isinstance(provider, OpenAIProvider):
        usage = provider.last_usage

    cost = estimate_cost_usd(usage)
    logger.info(
        "analyst llm cost=$%.4f prompt=%s output=%s model=%s",
        cost,
        usage.prompt_tokens,
        usage.completion_tokens,
        llm_model(),
    )
    yield _usage_event(usage)

    text = "".join(full_text)
    if cache_key and export_dir and text.strip():
        set_cached(
            export_dir,
            cache_key,
            text,
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            cost_usd=cost,
        )

    yield {"type": "done"}


async def stream_investigation_brief(
    context: dict[str, Any],
    export_dir: Path,
) -> AsyncIterator[dict[str, Any]]:
    """Generate or replay the post-analysis INVESTIGATION BRIEF."""
    existing = get_brief(export_dir)
    if existing:
        async for event in _stream_cached(existing):
            yield event
        yield {"type": "done", "cached": True}
        return

    if not llm_api_key():
        yield {"type": "error", "code": "llm_not_configured", "message": OFFLINE_MESSAGE}
        return

    if not await _llm_reachable():
        yield {"type": "error", "code": "llm_offline", "message": OFFLINE_MESSAGE}
        return

    provider = get_llm_provider()

    system = load_analyst_system_prompt()
    prompt = (
        "Investigation context (source of truth):\n"
        f"{_clip_context_json(context)}\n\n"
        f"{CURSOR_FORMAT_REMINDER}"
        f"{BRIEF_INSTRUCTION}"
    )

    full_text: list[str] = []
    try:
        async for token in provider.stream_generate(
            prompt,
            system=system,
            temperature=llm_temperature(),
            max_tokens=llm_max_output_tokens(),
        ):
            full_text.append(token)
            yield {"type": "token", "token": token}
    except Exception as exc:
        yield {"type": "error", "code": "llm_error", "message": str(exc)[:500]}
        return

    usage = TokenUsage()
    if isinstance(provider, OpenAIProvider):
        usage = provider.last_usage

    cost = estimate_cost_usd(usage)
    yield _usage_event(usage)

    text = "".join(full_text).strip()
    if text:
        save_brief(export_dir, text)

    yield {"type": "done"}
