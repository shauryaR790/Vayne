"""Tests for evidence-backed investigation prioritization."""

from __future__ import annotations

from product.backend.services.investigation_evidence import _build_business_impact
from product.backend.services.investigation_prioritization import (
    build_executive_metrics,
    build_investigation_audit,
    build_priority_queue,
)


def test_business_impact_does_not_invent_without_analyst_fields():
    impact = _build_business_impact({}, title="OpenSSH", host="10.0.0.1", cve="CVE-2024-0001")
    assert "unknown" in impact["summary"].lower() or "needs validation" in impact["summary"].lower()
    assert "could remotely control" not in impact["attacker_gains"].lower()


def test_priority_queue_includes_explicit_reasons():
    findings = [
        {
            "id": "f1",
            "title": "Apache HTTP Server",
            "host": "web.example.com",
            "severity": "HIGH",
            "machine_confidence": 78,
            "classification": "LIKELY_EXPLOITABLE",
            "claim_status": "suspected",
            "sources": ["Nmap", "Nessus", "OpenVAS"],
            "validated_checks": ["Host alive", "Port open", "Reachable from entry point"],
            "not_validated_checks": ["Privilege escalation"],
            "evidence": ["Apache/2.4.49 on port 443"],
            "business_impact_detail": {"summary": "Customer-facing web tier exposure."},
        }
    ]
    queue = build_priority_queue(
        confirmed_findings=findings,
        candidate_paths=[],
        hypotheses=[],
        cross_source_matches=3,
    )
    assert queue
    top = queue[0]
    assert top["tier"] in ("Critical", "High", "Medium")
    assert top["kind"] == "investigation"
    assert any("scanner" in r.lower() or "corroborat" in r.lower() for r in top["priority_reasons"])
    assert top["evidence_count"] >= 1
    assert " on " not in top["title"].lower() or "internet" in top["title"].lower()


def test_self_review_flags_incomplete_findings():
    findings = [
        {
            "id": "f-incomplete",
            "title": "SMB Signing Disabled",
            "severity": "MEDIUM",
            "machine_confidence": 82,
            "self_review": {"complete": False},
        }
    ]
    review = {"complete": False, "findings_incomplete": ["f-incomplete"], "findings_reviewed": 1, "findings_complete": 0}
    audit = build_investigation_audit(review, findings)
    assert audit["complete"] is False
    assert audit["unsupported_claims_blocked"] == 1


def test_executive_metrics_from_engine_counts():
    metrics = build_executive_metrics(
        file_count=5,
        asset_count=12,
        findings_loaded=400,
        duplicates_removed=320,
        confirmed_count=8,
        priority_queue=[{"tier": "Critical"}, {"tier": "Low"}],
        hours_saved=2.5,
        minutes_saved=0,
        cross_source_matches=4,
        validated_paths=1,
    )
    assert metrics["files"] == 5
    assert metrics["duplicates_removed"] == 320
    assert metrics["require_attention"] == 1
    assert metrics["analyst_hours_saved"] == 2.5
