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

from vayne.business.impact import compute_business_impact
from vayne.contradiction import build_conflicts
from vayne.evidence.evidence_graph import build_evidence_graph
from vayne.evidence.quality import aggregate_quality
from vayne.models import AttackPath, CorrelatedFinding, InvestigationReport, ValidationResult
from vayne.reasoning import build_confidence_timeline, build_reasoning
from vayne.review.self_review import review_finding, review_investigation
from vayne.service_intel import get_profile, recommendations_for


def build_finding_intelligence(
    correlated: CorrelatedFinding,
    validation: ValidationResult,
    attack_paths: list[AttackPath] | None = None,
) -> dict[str, Any]:
    """Assemble the full engine intelligence bundle for one finding."""
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
    bundle["self_review"] = review_finding(correlated, validation, bundle)
    return bundle


def build_investigation_intelligence(
    report: InvestigationReport,
) -> dict[str, Any]:
    """Report-level artifacts (facts.json / confidence.json / ... payloads)."""
    facts: list[dict[str, Any]] = []
    confidence: list[dict[str, Any]] = []
    reasoning: list[dict[str, Any]] = []
    timeline: list[dict[str, Any]] = []
    recommendations: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []

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

    graph = build_evidence_graph(graph_inputs).as_dict()

    artifacts = {
        "facts": {"findings": facts, "count": len(facts)},
        "confidence": {"findings": confidence},
        "reasoning": {"findings": reasoning},
        "graph": graph,
        "timeline": {"findings": timeline},
        "recommendations": {"findings": recommendations},
        "conflicts": {"conflicts": conflicts, "count": len(conflicts)},
    }
    artifacts["review"] = review_investigation(report, artifacts)
    return artifacts
