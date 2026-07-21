"""Tests for engine-native analyst investigation generation."""

from __future__ import annotations

from vayne.investigation.confidence_bridge import apply_confidence_bridge
from vayne.investigation.generation import build_analyst_investigations
from vayne.investigation.noise_filter import filter_investigated_findings, is_pure_observation
from vayne.investigation.quality_score import composite_priority_score, compute_quality_score
from vayne.investigation.self_critique import run_investigation_self_critique
from vayne.models import (
    AnalystBrief,
    Classification,
    CorrelatedFinding,
    InvestigatedFinding,
    InvestigationReport,
    InvestigationStats,
    RemediationTimeline,
    ValidationResult,
)


def _finding(
    *,
    fid: str = "f1",
    title: str = "Apache HTTP Server 2.4.49",
    host: str = "web.example.com",
    cve: str = "CVE-2021-41773",
    classification: Classification = Classification.LIKELY_EXPLOITABLE,
    confidence: int = 82,
) -> InvestigatedFinding:
    corr = CorrelatedFinding(
        id=fid,
        title=title,
        host=host,
        severity="critical",
        cve=cve,
        sources=["Nmap", "Nessus"],
        findings=[],
    )
    val = ValidationResult(
        classification=classification,
        confidence=confidence,
        overall_confidence=confidence,
        exploit_confidence=70,
        impact_confidence=60,
        observation_confidence=80,
        reliability_confidence=75,
        cve_applicable=True,
        reachable=True,
    )
    intel = {
        "business_impact": {"summary": "Customer-facing web tier exposure.", "score": 75},
        "investigation": {
            "hypotheses": [{"category": "alternate", "label": "Misconfigured proxy only"}],
            "investigation_tasks": [{"title": "Confirm path traversal exploitability on Apache 2.4.49"}],
            "self_challenge": {"net_confidence_effect": -3, "unresolved_count": 1},
            "validation_loop": {"confidence_delta": 2},
        },
        "conflicts": [],
        "reasoning": ["Internet-facing Apache with mapped CVE."],
    }
    return InvestigatedFinding(
        correlated=corr,
        validation=val,
        analyst=AnalystBrief(),
        remediation=RemediationTimeline(),
        exploitability_score=70,
        intelligence=intel,
    )


def test_pure_service_observation_filtered():
    corr = CorrelatedFinding(id="s1", title="http", host="10.0.0.1", findings=[], sources=["Nmap"])
    val = ValidationResult(
        classification=Classification.OBSERVED,
        confidence=40,
        overall_confidence=40,
    )
    assert is_pure_observation(corr, val)


def test_confidence_bridge_applies_self_challenge():
    val = ValidationResult(
        classification=Classification.LIKELY_EXPLOITABLE,
        confidence=80,
        overall_confidence=80,
        exploit_confidence=70,
    )
    bridged = apply_confidence_bridge(
        val,
        {"net_confidence_effect": -5},
        {"confidence_delta": 3},
    )
    assert bridged.overall_confidence == 78
    assert bridged.exploit_confidence == 65


def test_build_analyst_investigations_produces_cluster_not_service():
    report = InvestigationReport(
        name="test",
        target="demo",
        duration_seconds=1.0,
        stats=InvestigationStats(),
        findings=[
            _finding(),
            _finding(
                fid="f-http",
                title="http",
                cve="",
                classification=Classification.OBSERVED,
                confidence=40,
            ),
        ],
        attack_paths=[],
    )
    payload = build_analyst_investigations(report)
    invs = payload["investigations"]
    assert invs
    top = invs[0]
    assert top["kind"] == "investigation"
    assert "http on" not in top["title"].lower()
    assert top.get("purpose", {}).get("what_is_happening")
    assert top.get("reasoning_chain", {}).get("most_likely_explanation")
    assert top.get("quality_score", {}).get("business_impact") >= 0
    assert top.get("next_best_actions")


def test_noise_filter_retains_cve_on_different_hosts():
    a = _finding(fid="a", host="host-a")
    b = _finding(fid="b", host="host-b")
    kept, meta = filter_investigated_findings([a, b])
    assert len(kept) == 2
    assert meta["statistics"]["retained"] == 2


def test_self_critique_flags_overstated_confidence():
    critique = run_investigation_self_critique(
        {"title": "Test", "claim_status": "confirmed", "confidence": 55, "child_count": 1},
        [_finding()],
    )
    assert critique["overstated_confidence"] is True


def test_composite_priority_score_bounded():
    quality = compute_quality_score(
        members=[_finding()],
        attack_paths=[],
        cluster_type="cve",
    )
    score = composite_priority_score(quality)
    assert 0 <= score <= 99
