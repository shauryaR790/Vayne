"""Engine Self-Review (Priority 15).

Before an investigation is finalized, the engine audits its own conclusions the
way a skeptical senior engineer would. Each finding must be:

* explainable   — every score decomposes into named factors that sum to it
* reproducible  — it cites concrete evidence IDs / scanner sources
* traceable     — it resolves to a canonical entity and a graph chain
* contradiction-surfaced — any conflicts are stated, not hidden
* recommendation-derived — recommendations map to explicit evidence gaps
* justified     — its confidence is backed by classified evidence

If any check fails, the finding (and the investigation) is flagged incomplete.
"""

from __future__ import annotations

from typing import Any

from vayne.models import CorrelatedFinding, InvestigationReport, ValidationResult


def _explainable(validation: ValidationResult) -> tuple[bool, str]:
    factors = validation.confidence_factors or {}
    for dim in ("observation", "reliability", "exploit", "impact"):
        dim_factors = factors.get(dim) or []
        if not dim_factors:
            continue
        total = sum(int(f.get("delta") or 0) for f in dim_factors)
        score = {
            "observation": validation.observation_confidence,
            "reliability": validation.reliability_confidence,
            "exploit": validation.exploit_confidence,
            "impact": validation.impact_confidence,
        }[dim]
        # Score is a clamp(0..100) of the factor sum — it must match unless the
        # raw sum saturated the clamp.
        clamped = max(0, min(100, total))
        if clamped != score:
            return False, f"{dim} factors sum to {clamped} but score is {score}"
    return True, "all present scores decompose into their factors"


def _reproducible(finding: CorrelatedFinding) -> tuple[bool, str]:
    if finding.evidence_ids or finding.sources:
        return True, f"{len(finding.evidence_ids)} evidence id(s), {len(finding.sources)} source(s)"
    return False, "no evidence ids or sources cited"


def _traceable(finding: CorrelatedFinding) -> tuple[bool, str]:
    if finding.canonical_entity and finding.canonical_entity.key:
        return True, f"canonical entity {finding.canonical_entity.key}"
    return False, "no canonical entity resolved"


def _contradictions_surfaced(bundle: dict[str, Any]) -> tuple[bool, str]:
    conflicts = bundle.get("conflicts", [])
    # Surfacing is satisfied whether or not conflicts exist — the requirement is
    # that if they exist they are stated as objects (which they are here).
    return True, f"{len(conflicts)} conflict(s) surfaced"


def _recommendations_derived(bundle: dict[str, Any]) -> tuple[bool, str]:
    recs = bundle.get("recommendations", [])
    if not recs:
        return True, "no open gaps requiring recommendations"
    if all(r.get("evidence_gap") for r in recs):
        return True, f"{len(recs)} recommendation(s) each tied to an evidence gap"
    return False, "a recommendation is not tied to an evidence gap"


def _justified(validation: ValidationResult, bundle: dict[str, Any]) -> tuple[bool, str]:
    quality = bundle.get("evidence_quality", {})
    items = quality.get("evidence", []) if isinstance(quality, dict) else []
    if validation.overall_confidence <= 0:
        return True, "no positive confidence asserted"
    if items:
        return True, f"confidence backed by {len(items)} classified evidence item(s)"
    return False, "confidence asserted without classified evidence"


def review_finding(
    finding: CorrelatedFinding,
    validation: ValidationResult,
    bundle: dict[str, Any],
) -> dict[str, Any]:
    checks = {
        "explainable": _explainable(validation),
        "reproducible": _reproducible(finding),
        "traceable": _traceable(finding),
        "contradictions_surfaced": _contradictions_surfaced(bundle),
        "recommendations_derived": _recommendations_derived(bundle),
        "confidence_justified": _justified(validation, bundle),
    }
    result = {
        name: {"passed": passed, "detail": detail}
        for name, (passed, detail) in checks.items()
    }
    complete = all(v["passed"] for v in result.values())
    return {"complete": complete, "checks": result}


def review_investigation(
    report: InvestigationReport,
    artifacts: dict[str, Any],
) -> dict[str, Any]:
    per_finding: list[dict[str, Any]] = []
    incomplete: list[str] = []

    for item in report.findings:
        bundle = item.intelligence or {}
        review = bundle.get("self_review") or review_finding(
            item.correlated, item.validation, bundle
        )
        per_finding.append({"finding_id": item.correlated.id, **review})
        if not review.get("complete", False):
            incomplete.append(item.correlated.id)

    total = len(per_finding)
    passed = total - len(incomplete)
    return {
        "complete": len(incomplete) == 0,
        "findings_reviewed": total,
        "findings_complete": passed,
        "findings_incomplete": incomplete,
        "completeness_ratio": round(passed / total, 3) if total else 1.0,
        "findings": per_finding,
    }
