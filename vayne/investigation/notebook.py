"""Investigation Notebook (Priority 11).

A timestamped, replayable log of the investigation. Timestamps are synthetic but
deterministic (a fixed base clock advanced per step) so the notebook reproduces
identically across runs — the user can literally replay how the finding was
investigated and watch confidence move.
"""

from __future__ import annotations

from typing import Any

from vayne.models import CorrelatedFinding, ValidationResult

_BASE_MIN = 9 * 60 + 42  # 09:42, matching the analyst-notebook idiom


def _clock(step: int) -> str:
    total = _BASE_MIN + step
    return f"{(total // 60) % 24:02d}:{total % 60:02d}"


def build_notebook(
    finding: CorrelatedFinding,
    validation: ValidationResult,
    timeline: list[dict[str, Any]],
    primitives: list[dict[str, Any]],
    self_challenge: dict[str, Any],
) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    step = 0

    def add(event: str, confidence: int | None = None, note: str = "") -> None:
        nonlocal step
        entries.append({
            "time": _clock(step),
            "event": event,
            "confidence": confidence,
            "note": note,
        })
        step += 1

    # Evidence collection, primitive by primitive.
    for prim in primitives[:8]:
        add(f"{prim['display']} collected", note=f"{prim['detail']} ({prim.get('source_tool') or 'scan'})")

    # Confidence evolution, straight from the timeline.
    for t in timeline:
        add(t.get("event", "confidence updated"), confidence=t.get("confidence"), note=t.get("detail", ""))

    # Self-challenge outcomes that changed the picture.
    for ch in self_challenge.get("challenges", []):
        if ch.get("weakens"):
            add("Self-challenge raised doubt", note=f"{ch['question']} → {ch['answer']}")

    # Conclusion.
    final = int(validation.overall_confidence or (timeline[-1]["confidence"] if timeline else 0))
    verdict = getattr(validation.classification, "value", str(validation.classification))
    add(f"Finding {('retained' if verdict != 'FALSE POSITIVE' else 'discarded')} as {verdict}",
        confidence=final, note=self_challenge.get("verdict", ""))

    return entries
