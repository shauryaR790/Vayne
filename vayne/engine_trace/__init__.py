"""Public Engine Trace API."""

from vayne.engine_trace.emitter import EngineTraceEmitter, EventCallback
from vayne.engine_trace.events import (
    STAGE_AI,
    STAGE_CONFIDENCE,
    STAGE_CORRELATION,
    STAGE_DEDUPLICATION,
    STAGE_EXPORT,
    STAGE_GRAPH,
    STAGE_INVESTIGATION,
    STAGE_NORMALIZATION,
    STAGE_PARSER,
    STAGE_PRIORITY,
    STAGE_RISK,
    STAGE_SUMMARY,
    STAGE_VALIDATION,
    EngineEvent,
)

__all__ = [
    "EngineEvent",
    "EngineTraceEmitter",
    "EventCallback",
    "STAGE_PARSER",
    "STAGE_NORMALIZATION",
    "STAGE_DEDUPLICATION",
    "STAGE_CORRELATION",
    "STAGE_VALIDATION",
    "STAGE_CONFIDENCE",
    "STAGE_GRAPH",
    "STAGE_PRIORITY",
    "STAGE_INVESTIGATION",
    "STAGE_RISK",
    "STAGE_EXPORT",
    "STAGE_SUMMARY",
    "STAGE_AI",
]
