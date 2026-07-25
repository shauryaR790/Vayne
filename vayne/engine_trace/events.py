"""Structured Engine Trace events — real telemetry from the investigation engine."""

from __future__ import annotations

import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any


def _now_ms() -> float:
    return time.time() * 1000


@dataclass
class EngineEvent:
    """One structured emission from a deterministic pipeline stage.

    Frontend renders these fields as-is. Never invent values on the client.
    """

    stage: str
    event: str
    timestamp_ms: float = field(default_factory=_now_ms)
    execution_ms: float | None = None
    message: str | None = None
    fields: dict[str, Any] = field(default_factory=dict)
    formula: dict[str, Any] | None = None
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        # Drop empty optional keys for a clean wire format.
        if payload.get("execution_ms") is None:
            payload.pop("execution_ms", None)
        if not payload.get("message"):
            payload.pop("message", None)
        if not payload.get("fields"):
            payload.pop("fields", None)
        if not payload.get("formula"):
            payload.pop("formula", None)
        return payload


# Canonical stage ids (stable for UI grouping)
STAGE_PARSER = "parser"
STAGE_NORMALIZATION = "normalization"
STAGE_DEDUPLICATION = "deduplication"
STAGE_CORRELATION = "correlation"
STAGE_VALIDATION = "validation"
STAGE_CONFIDENCE = "confidence"
STAGE_GRAPH = "attack_graph"
STAGE_PRIORITY = "priority"
STAGE_INVESTIGATION = "investigation"
STAGE_RISK = "risk"
STAGE_EXPORT = "export"
STAGE_SUMMARY = "summary"
STAGE_AI = "ai_explanation"
