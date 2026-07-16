"""Disk cache for repeatable LLM analyst responses per investigation."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

CACHE_FILENAME = "analyst_llm_cache.json"
BRIEF_FILENAME = "investigation_brief_v3.txt"

# Preset / report keys that should never be regenerated once cached.
CACHEABLE_KEYS = frozenset({
    "executive",
    "technical",
    "remediation",
    "attack_chain",
    "graph",
    "brief",
})


def resolve_cache_key(preset_id: str | None, report_mode: str | None) -> str | None:
    if preset_id and preset_id in CACHEABLE_KEYS:
        return preset_id
    if report_mode and report_mode in CACHEABLE_KEYS:
        return report_mode
    return None


def _cache_path(export_dir: Path) -> Path:
    return export_dir / CACHE_FILENAME


def load_cache(export_dir: Path) -> dict[str, Any]:
    path = _cache_path(export_dir)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def get_cached(export_dir: Path, key: str) -> dict[str, Any] | None:
    entry = load_cache(export_dir).get(key)
    if not entry or not entry.get("text"):
        return None
    return entry


def set_cached(
    export_dir: Path,
    key: str,
    text: str,
    *,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    cost_usd: float = 0.0,
) -> None:
    export_dir.mkdir(parents=True, exist_ok=True)
    data = load_cache(export_dir)
    data[key] = {
        "text": text,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cost_usd": cost_usd,
    }
    path = _cache_path(export_dir)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("cached analyst response key=%s chars=%s", key, len(text))


def get_brief(export_dir: Path) -> str | None:
    path = export_dir / BRIEF_FILENAME
    if not path.exists():
        return None
    try:
        text = path.read_text(encoding="utf-8").strip()
        return text or None
    except OSError:
        return None


def save_brief(export_dir: Path, text: str) -> None:
    export_dir.mkdir(parents=True, exist_ok=True)
    (export_dir / BRIEF_FILENAME).write_text(text.strip(), encoding="utf-8")
    set_cached(export_dir, "brief", text)
