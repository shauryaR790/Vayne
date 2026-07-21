"""Investigation-level self-critique before surfacing to analysts (Rule 16)."""

from __future__ import annotations

from typing import Any

from vayne.models import InvestigatedFinding


def run_investigation_self_critique(
    investigation: dict[str, Any],
    members: list[InvestigatedFinding],
) -> dict[str, Any]:
    issues: list[str] = []
    contradictions: list[str] = []
    alternatives: list[str] = []
    merge_errors: list[str] = []

    confidence = int(investigation.get("confidence") or 0)
    claim = str(investigation.get("claim_status") or "needs_validation")

    for item in members:
        intel = item.intelligence or {}
        sc = intel.get("self_challenge") or {}
        if sc.get("unresolved_count", 0) > 2:
            issues.append(f"{item.correlated.title}: {sc.get('unresolved_count')} unresolved challenges")
        for c in intel.get("conflicts") or []:
            contradictions.append(str(c.get("detail") or c.get("kind") or "conflict"))
        inv = intel.get("investigation") or {}
        for hyp in inv.get("hypotheses") or []:
            if hyp.get("category") != "primary":
                alternatives.append(str(hyp.get("label") or hyp.get("title") or ""))

    if len(members) == 1 and int(investigation.get("child_count") or 0) > 3:
        merge_errors.append("Single finding assigned to cluster with high child count — verify merge key")

    overstated = claim == "confirmed" and confidence < 70
    if overstated:
        issues.append("Claim status confirmed but composite confidence below 70%")

    could_be_wrong = _could_be_wrong(investigation, issues, contradictions)
    internally_consistent = not issues and not merge_errors and len(contradictions) <= 1

    if issues and confidence > 80:
        confidence = min(confidence, 75)

    return {
        "could_be_wrong": could_be_wrong,
        "overstated_confidence": overstated,
        "missed_contradictions": contradictions[:6],
        "merge_errors": merge_errors,
        "better_explanations": [a for a in alternatives if a][:4],
        "issues": issues[:8],
        "internally_consistent": internally_consistent,
        "confidence_adjustment": -5 if issues else 0,
    }


def _could_be_wrong(inv: dict[str, Any], issues: list[str], contradictions: list[str]) -> str:
    if contradictions:
        return (
            f"Scanners disagree on {inv.get('title')}; "
            "exploitation has not been reproduced in all cases."
        )
    if issues:
        return f"Self-challenge flagged: {'; '.join(issues[:2])}"
    missing = inv.get("work_remaining") or []
    if missing:
        return f"Key evidence still missing: {missing[0]}"
    return "Low risk if evidence accurately reflects the environment — validate before acting."
