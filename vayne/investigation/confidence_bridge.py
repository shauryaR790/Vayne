"""Apply self-challenge and validation-loop deltas to exported finding confidence (Rule 9, 16)."""

from __future__ import annotations

from typing import Any

from vayne.models import ValidationResult


def apply_confidence_bridge(
    validation: ValidationResult,
    self_challenge: dict[str, Any] | None = None,
    validation_loop: dict[str, Any] | None = None,
) -> ValidationResult:
    """Return a copy of validation with adjusted overall/exploit confidence."""
    self_challenge = self_challenge or {}
    validation_loop = validation_loop or {}

    net = int(self_challenge.get("net_confidence_effect") or 0)
    loop_delta = int(validation_loop.get("confidence_delta") or 0)

    overall = max(0, min(100, int(validation.overall_confidence) + net + loop_delta))
    exploit = max(0, min(100, int(validation.exploit_confidence) + net))

    if validation_loop.get("exploit_confirmed"):
        exploit = max(exploit, 75)

    factors = dict(validation.confidence_factors or {})
    bridge_factors = list(factors.get("overall") or [])
    if net:
        bridge_factors.append({"label": "Self-challenge adjustment", "delta": net})
    if loop_delta:
        bridge_factors.append({"label": "Validation loop adjustment", "delta": loop_delta})
    factors["overall"] = bridge_factors[-12:]

    missing = list(validation.missing_evidence or [])
    for item in self_challenge.get("what_would_overturn") or []:
        s = str(item).strip()
        if s and s not in missing:
            missing.append(s)

    return validation.model_copy(
        update={
            "overall_confidence": overall,
            "exploit_confidence": exploit,
            "confidence": overall,
            "confidence_factors": factors,
            "missing_evidence": missing[:8],
        }
    )
