"""Structured investigation notebook — canonical analyst reasoning chain.

Every conclusion follows the same evidence-first structure:

  Observation → Evidence → Reasoning → Alternative explanations →
  Confidence → Missing evidence → Recommended next step

This is the machine-readable form the product layer surfaces in the UI.
"""

from __future__ import annotations

from typing import Any

from vayne.models import CorrelatedFinding, ValidationResult


def _claim_status(validation: ValidationResult) -> str:
    exploit_confirmed = str(validation.exploitability_status or "") == "confirmed"
    classification = str(getattr(validation.classification, "value", validation.classification) or "")
    cu = classification.upper()
    if exploit_confirmed or "CONFIRMED" in cu:
        return "confirmed"
    if "LIKELY" in cu or "UNCONFIRMED" in cu:
        return "suspected"
    if "OBSERVED" in cu:
        return "observed"
    if "FALSE POSITIVE" in cu:
        return "rejected"
    return "needs_validation"


def _observation(finding: CorrelatedFinding, validation: ValidationResult) -> str:
    host = finding.host or "target"
    title = finding.title or "Finding"
    sources = len({f.source_tool for f in (finding.findings or []) if f.source_tool}) or len(
        finding.sources or []
    )
    if validation.service_fingerprinted or validation.version_matches:
        return (
            f"{title} on {host} was fingerprinted"
            + (f" (version matched)" if validation.version_matches else "")
            + f" from {sources} scanner source{'s' if sources != 1 else ''}."
        )
    if validation.host_alive or validation.port_open:
        return f"{title} on {host} was observed (host/port present); service detail incomplete."
    return f"{title} on {host} was reported by scanner output — reachability not fully confirmed."


def _evidence_items(
    finding: CorrelatedFinding,
    primitives: list[dict[str, Any]],
) -> list[str]:
    items: list[str] = []
    for prim in primitives[:8]:
        detail = str(prim.get("detail") or "").strip()
        display = str(prim.get("display") or "Evidence").strip()
        source = str(prim.get("source_tool") or "").strip()
        line = display
        if detail:
            line = f"{display}: {detail[:180]}"
        if source:
            line = f"{line} ({source})"
        items.append(line)
    for ev in (finding.evidence or [])[:4]:
        text = str(ev).strip()
        if text and text not in items:
            items.append(text[:220])
    for src in (finding.sources or [])[:6]:
        label = str(src).strip()
        if label:
            items.append(f"Scanner source: {label}")
    return items[:12]


def _alternatives(hypotheses: list[dict[str, Any]]) -> list[str]:
    alts: list[str] = []
    for hyp in hypotheses:
        if hyp.get("category") == "primary":
            continue
        label = str(hyp.get("label") or hyp.get("title") or "").strip()
        prob = hyp.get("probability")
        if label:
            alts.append(f"{label}" + (f" ({prob}% likelihood)" if prob is not None else ""))
    if not alts:
        alts.append("Benign misconfiguration or scanner false positive until validated.")
    return alts[:6]


def _missing(validation: ValidationResult, recommendations: list[dict[str, Any]]) -> list[str]:
    missing = [str(m).strip() for m in (validation.missing_evidence or []) if str(m).strip()]
    for rec in recommendations[:6]:
        gap = str(rec.get("evidence_gap") or rec.get("action") or "").strip()
        if gap and gap not in missing:
            missing.append(gap[:200])
    if not missing:
        if not validation.reproducible and str(validation.exploitability_status or "") != "confirmed":
            missing.append("Controlled exploit reproduction or authenticated re-check.")
    return missing[:8]


def _next_step(recommendations: list[dict[str, Any]], tasks: list[dict[str, Any]]) -> str:
    for rec in recommendations:
        action = str(rec.get("action") or rec.get("evidence_gap") or "").strip()
        if action:
            return action[:240]
    for task in tasks:
        label = str(task.get("label") or task.get("action") or "").strip()
        if label:
            return label[:240]
    return "Validate finding manually in a controlled test window before asserting compromise."


def build_structured_notebook(
    finding: CorrelatedFinding,
    validation: ValidationResult,
    *,
    primitives: list[dict[str, Any]] | None = None,
    reasoning: list[str] | None = None,
    hypotheses: list[dict[str, Any]] | None = None,
    recommendations: list[dict[str, Any]] | None = None,
    tasks: list[dict[str, Any]] | None = None,
    self_challenge: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the canonical investigation notebook entry for one finding."""
    primitives = primitives or []
    reasoning = reasoning or []
    hypotheses = hypotheses or []
    recommendations = recommendations or []
    tasks = tasks or []
    self_challenge = self_challenge or {}

    confidence_score = int(validation.overall_confidence or 0)
    confidence_reasoning = reasoning[:4] or [
        f"Observation {validation.observation_confidence}% · "
        f"Reliability {validation.reliability_confidence}% · "
        f"Exploit {validation.exploit_confidence}% · "
        f"Impact {validation.impact_confidence}%."
    ]

    challenges = self_challenge.get("challenges") or []
    if challenges:
        for ch in challenges[:2]:
            if ch.get("weakens"):
                confidence_reasoning.append(
                    f"Self-challenge: {ch.get('question', '')} → {ch.get('answer', '')}"
                )

    status = _claim_status(validation)
    return {
        "observation": _observation(finding, validation),
        "evidence": _evidence_items(finding, primitives),
        "reasoning": confidence_reasoning[:6],
        "alternative_explanations": _alternatives(hypotheses),
        "confidence": {
            "score": confidence_score,
            "band": _confidence_band(confidence_score, status),
            "status": status,
            "reasoning": confidence_reasoning[:4],
        },
        "missing_evidence": _missing(validation, recommendations),
        "recommended_next_step": _next_step(recommendations, tasks),
    }


def _confidence_band(score: int, status: str) -> str:
    if status in ("needs_validation", "rejected"):
        return "Unknown"
    if score >= 85:
        return "High"
    if score >= 65:
        return "Medium-High"
    if score >= 45:
        return "Medium"
    if score >= 25:
        return "Low"
    return "Unknown"
