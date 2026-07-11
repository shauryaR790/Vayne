"""Confidence Timeline (Priority 12).

Reconstructs how confidence *evolved* as evidence accumulated, so a reader can
watch a finding grow from a first observation to a corroborated, possibly
replayed conclusion — including the dip when a contradiction was detected.

The timeline is a deterministic replay of the same factor contributions the
confidence engine already recorded, applied in analyst-realistic order. The
final step always equals the engine's observation/overall confidence, so the
timeline is a faithful decomposition, not a parallel guess.
"""

from __future__ import annotations

from typing import Any

from vayne.models import CorrelatedFinding, ValidationResult

# Order in which evidence realistically arrives during an investigation. Each
# stage collects the observation-dimension factors whose labels match.
_STAGES: list[tuple[str, str, tuple[str, ...]]] = [
    ("discovery", "discovered", ("evidence class", "host / port", "reachable", "banner", "thin", "partial", "rich")),
    ("version", "version confirmed", ("version", "cpe")),
    ("correlation", "scanner agreement", ("scanner agreement", "independent observation")),
    ("conflict", "contradiction detected", ("conflict",)),
]


def build_confidence_timeline(
    finding: CorrelatedFinding,
    validation: ValidationResult,
) -> list[dict[str, Any]]:
    obs_factors = (validation.confidence_factors or {}).get("observation", [])
    if not obs_factors:
        return []

    label = (
        finding.canonical_entity.label if finding.canonical_entity else finding.title
    ) or finding.title

    used: set[int] = set()
    running = 0
    steps: list[dict[str, Any]] = []

    def _band_factors(keys: tuple[str, ...]) -> list[dict[str, Any]]:
        picked = []
        for i, f in enumerate(obs_factors):
            if i in used:
                continue
            low = str(f.get("label", "")).lower()
            if any(k in low for k in keys):
                used.add(i)
                picked.append(f)
        return picked

    for stage_id, verb, keys in _STAGES:
        picked = _band_factors(keys)
        if not picked and stage_id != "discovery":
            continue
        delta = sum(int(f.get("delta") or 0) for f in picked)
        running = max(0, min(100, running + delta))
        detail = ", ".join(str(f.get("label")) for f in picked) or "initial observation"
        steps.append(
            {
                "event": f"{label} {verb}" if stage_id == "discovery" else verb.capitalize(),
                "confidence": running,
                "delta": delta,
                "detail": detail,
                "kind": stage_id,
            }
        )

    # Any remaining observation factors folded into a final consolidation step.
    remaining = [f for i, f in enumerate(obs_factors) if i not in used]
    if remaining:
        delta = sum(int(f.get("delta") or 0) for f in remaining)
        running = max(0, min(100, running + delta))
        steps.append(
            {
                "event": "Observation consolidated",
                "confidence": running,
                "delta": delta,
                "detail": ", ".join(str(f.get("label")) for f in remaining),
                "kind": "consolidation",
            }
        )

    # Exploit confirmation as the final confidence lift, if present.
    if validation.reproducible or str(validation.exploitability_status) == "confirmed":
        steps.append(
            {
                "event": "Replay confirmed exploitability",
                "confidence": max(running, int(validation.overall_confidence or running)),
                "delta": max(0, int(validation.overall_confidence or running) - running),
                "detail": "Exploit reproduced / confirmed",
                "kind": "validation",
            }
        )

    return steps
