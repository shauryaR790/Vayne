"""Engine Trace emitter — collect + fan-out structured events."""

from __future__ import annotations

import json
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any

from vayne.engine_trace.events import EngineEvent

EventCallback = Callable[[EngineEvent], None]


class EngineTraceEmitter:
    """Thread-safe collector used during a single engine run."""

    def __init__(self, on_event: EventCallback | None = None):
        self._on_event = on_event
        self._events: list[EngineEvent] = []
        self._lock = threading.Lock()
        self._stage_started: dict[str, float] = {}

    def mark_stage_start(self, stage: str) -> None:
        import time

        with self._lock:
            self._stage_started[stage] = time.perf_counter()

    def stage_elapsed_ms(self, stage: str) -> float | None:
        import time

        with self._lock:
            started = self._stage_started.get(stage)
        if started is None:
            return None
        return round((time.perf_counter() - started) * 1000, 3)

    def emit(self, event: EngineEvent) -> None:
        with self._lock:
            self._events.append(event)
        if self._on_event is not None:
            self._on_event(event)

    def emit_stage(
        self,
        stage: str,
        event: str,
        *,
        message: str | None = None,
        fields: dict[str, Any] | None = None,
        formula: dict[str, Any] | None = None,
        execution_ms: float | None = None,
        auto_elapsed: bool = False,
    ) -> EngineEvent:
        elapsed = execution_ms
        if auto_elapsed and elapsed is None:
            elapsed = self.stage_elapsed_ms(stage)
        ev = EngineEvent(
            stage=stage,
            event=event,
            message=message,
            fields=fields or {},
            formula=formula,
            execution_ms=elapsed,
        )
        self.emit(ev)
        return ev

    @property
    def events(self) -> list[EngineEvent]:
        with self._lock:
            return list(self._events)

    def to_list(self) -> list[dict[str, Any]]:
        return [e.to_dict() for e in self.events]

    def persist(self, export_dir: Path) -> Path:
        path = export_dir / "engine_trace.jsonl"
        export_dir.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as fh:
            for event in self.events:
                fh.write(json.dumps(event.to_dict(), ensure_ascii=False) + "\n")
        # Also write a JSON array for convenient GET.
        (export_dir / "engine_trace.json").write_text(
            json.dumps(self.to_list(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return path
