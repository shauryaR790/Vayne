"""Intelligence Hub (Priority 14 — Facts Before LLM).

Every conclusion VANE presents originates here. For each finding the hub bundles
the engine's own facts, confidence, evidence quality, conflicts, service profile,
recommendations, business impact, reasoning, and timeline. At the report level it
produces the structured artifacts (facts / confidence / reasoning / graph /
timeline / recommendations / conflicts) that the LLM may explain but never
invent.
"""

from __future__ import annotations

from typing import Any

from vayne.attack_paths.proof import GraphProof
from vayne.business.impact import compute_business_impact
from vayne.calibration import default_calibrator
from vayne.contradiction import build_conflicts
from vayne.evidence.evidence_graph import build_evidence_graph
from vayne.evidence.quality import aggregate_quality
from vayne.investigation import build_investigation, build_rejected_path_investigations
from vayne.investigation.structured_notebook import build_structured_notebook
from vayne.models import AttackPath, CorrelatedFinding, InvestigationReport, ValidationResult
from vayne.reasoning import build_confidence_timeline, build_reasoning
from vayne.review.self_review import review_finding, review_investigation
from vayne.service_intel import get_profile, recommendations_for


def build_finding_intelligence(
    correlated: CorrelatedFinding,
    validation: ValidationResult,
    attack_paths: list[AttackPath] | None = None,
    *,
    full_investigation: bool = True,
) -> dict[str, Any]:
    """Assemble the full engine intelligence bundle for one finding.

    ``full_investigation`` controls the Phase 3 autonomous investigation (the
    heaviest per-finding computation). At scale the orchestrator runs it for the
    highest-priority findings and skips it for the long tail; the Phase 1/2
    facts, confidence, conflicts, recommendations and reasoning are always built.
    """
    attack_paths = attack_paths or []
    profile = get_profile(correlated)
    quality = aggregate_quality(correlated.findings or [])
    conflicts = [c.as_dict() for c in build_conflicts(correlated)]
    recommendations = recommendations_for(correlated, validation)
    business_impact = compute_business_impact(correlated, validation, profile, attack_paths)
    reasoning = build_reasoning(correlated, validation, profile, quality, conflicts)
    timeline = build_confidence_timeline(correlated, validation)

    entity = correlated.canonical_entity

    confidence = {
        "observation": validation.observation_confidence,
        "reliability": validation.reliability_confidence,
        "exploit": validation.exploit_confidence,
        "impact": validation.impact_confidence,
        "overall": validation.overall_confidence,
        "dimensions": validation.confidence_dimensions,
        "factors": validation.confidence_factors,
        "supporting_evidence": validation.supporting_evidence,
        "contradicting_evidence": validation.contradicting_evidence,
        "missing_evidence": validation.missing_evidence,
    }

    facts = {
        "id": correlated.id,
        "title": correlated.title,
        "host": correlated.host,
        "port": correlated.port,
        "canonical_entity": entity.model_dump(mode="json") if entity else {},
        "classification": str(validation.classification),
        "cve": correlated.cve,
        "sources": correlated.sources,
        "evidence_ids": correlated.evidence_ids,
        "scanner_agreement": correlated.scanner_agreement.model_dump(mode="json")
        if correlated.scanner_agreement else {},
        "version_agreement": correlated.version_agreement.model_dump(mode="json")
        if correlated.version_agreement else {},
    }

    bundle = {
        "facts": facts,
        "confidence": confidence,
        "evidence_quality": validation.evidence_quality or quality.as_dict(),
        "conflicts": conflicts,
        "service_profile": profile.summary(),
        "recommendations": recommendations,
        "business_impact": business_impact,
        "reasoning": reasoning,
        "timeline": timeline,
    }
    # Phase 3 — the full autonomous investigation for this finding.
    if full_investigation:
        inv = build_investigation(correlated, validation, attack_paths)
        # Enrich structured notebook with recommendations once the full bundle exists.
        inv["structured_notebook"] = build_structured_notebook(
            correlated,
            validation,
            primitives=inv.get("evidence_primitives") or [],
            reasoning=reasoning,
            hypotheses=inv.get("hypotheses") or [],
            recommendations=recommendations,
            tasks=inv.get("investigation_tasks") or [],
            self_challenge=inv.get("self_challenge") or {},
        )
        bundle["investigation"] = inv
    else:
        bundle["investigation"] = {"deferred": True,
                                   "reason": "Full investigation deferred at scale; "
                                             "prioritized findings carry the complete investigation."}
    bundle["self_review"] = review_finding(correlated, validation, bundle)
    return bundle


def build_investigation_intelligence(
    report: InvestigationReport,
    graph_proof: GraphProof | None = None,
) -> dict[str, Any]:
    """Report-level artifacts (facts.json / confidence.json / ... payloads)."""
    facts: list[dict[str, Any]] = []
    confidence: list[dict[str, Any]] = []
    reasoning: list[dict[str, Any]] = []
    timeline: list[dict[str, Any]] = []
    recommendations: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    investigations: list[dict[str, Any]] = []

    graph_inputs: list[tuple[CorrelatedFinding, ValidationResult]] = []

    for item in report.findings:
        intel = item.intelligence or build_finding_intelligence(
            item.correlated, item.validation, report.attack_paths
        )
        fid = item.correlated.id
        graph_inputs.append((item.correlated, item.validation))

        facts.append({"finding_id": fid, **intel.get("facts", {})})
        confidence.append({"finding_id": fid, **intel.get("confidence", {})})
        reasoning.append({"finding_id": fid, "reasoning": intel.get("reasoning", [])})
        timeline.append({"finding_id": fid, "steps": intel.get("timeline", [])})
        recommendations.append(
            {"finding_id": fid, "recommendations": intel.get("recommendations", [])}
        )
        for c in intel.get("conflicts", []):
            conflicts.append({"finding_id": fid, **c})
        investigations.append({"finding_id": fid, **(intel.get("investigation") or {})})

    graph = build_evidence_graph(graph_inputs).as_dict()
    rejected_paths = build_rejected_path_investigations(graph_proof)

    artifacts = {
        "facts": {"findings": facts, "count": len(facts)},
        "confidence": {"findings": confidence},
        "reasoning": {"findings": reasoning},
        "graph": graph,
        "timeline": {"findings": timeline},
        "recommendations": {"findings": recommendations},
        "conflicts": {"conflicts": conflicts, "count": len(conflicts)},
        "investigations": {"findings": investigations, "count": len(investigations)},
        "rejected_paths": {"paths": rejected_paths, "count": len(rejected_paths)},
    }
    # Phase 4 — ground-truth validation summary and calibration status.
    artifacts["validation"] = _validation_summary(investigations)
    artifacts["calibration"] = _calibration_status()
    artifacts["review"] = review_investigation(report, artifacts)
    return artifacts


def _validation_summary(investigations: list[dict[str, Any]]) -> dict[str, Any]:
    """Report-level view of what is verified vs inferred, and outstanding probes."""
    verified: list[dict[str, Any]] = []
    inferred = 0
    open_probes = 0
    for inv in investigations:
        loop = inv.get("validation_loop") or {}
        if not loop:
            continue
        open_probes += int(loop.get("open_probe_count") or 0)
        if loop.get("exploit_confirmed"):
            verification = loop.get("verification") or {}
            verified.append({
                "finding_id": inv.get("finding_id"),
                "method": verification.get("method"),
                "label": verification.get("label"),
            })
        else:
            inferred += 1
    return {
        "verified_findings": verified,
        "verified_count": len(verified),
        "inferred_count": inferred,
        "open_probe_count": open_probes,
        "note": (
            "Exploit confidence is confirmed only where authenticated or reproduced "
            "evidence exists; all other exploit confidence is inferred and the listed "
            "probes would move it to confirmed."
        ),
    }


def _calibration_status() -> dict[str, Any]:
    cal = default_calibrator()
    data = cal.to_dict()
    families = data.get("families") or {}
    return {
        "is_calibrated": bool(families),
        "families": {name: fam.get("samples", 0) for name, fam in families.items()},
        "method": "binned isotonic reliability curve" if families else "identity (uncalibrated heuristic prior)",
        "note": (
            "Hypothesis and business-impact probabilities are heuristic priors. "
            "When labeled outcomes are supplied, the calibrator maps them to "
            "empirically-observed frequencies; until then values are reported raw "
            "and flagged uncalibrated."
        ),
    }
