"""Tests for investigation briefing payloads."""

from vayne.investigation.briefing import build_ignored_breakdown, estimate_analyst_review_minutes


def test_estimate_analyst_review_minutes():
    investigations = [
        {"estimated_review_minutes": 20},
        {"estimated_review_minutes": 15},
    ]
    assert estimate_analyst_review_minutes(investigations) == 35


def test_build_ignored_breakdown_assurance():
    breakdown = build_ignored_breakdown(
        findings_loaded=100,
        findings_retained=12,
        duplicates_removed=40,
        false_positives_removed=5,
        noise_suppressed=10,
        conflicts=[{"subject": "a"}],
        hypotheses=[],
        priority_queue=[{"tier": "Low"}, {"tier": "High"}],
        investigation_audit={"unsupported_claims_blocked": 0},
    )
    assert breakdown["duplicate_evidence_removed"] == 40
    assert breakdown["contradicted_findings"] == 1
    assert breakdown["low_business_impact"] == 1
    assert breakdown["assurance"] == "No critical evidence was hidden."


def test_build_ignored_breakdown_exceptions():
    breakdown = build_ignored_breakdown(
        findings_loaded=10,
        findings_retained=2,
        duplicates_removed=0,
        false_positives_removed=0,
        noise_suppressed=0,
        conflicts=[],
        hypotheses=[],
        priority_queue=[],
        investigation_audit={
            "unsupported_claims_blocked": 2,
            "flagged_findings": [{"title": "Test CVE", "issues": "needs validation"}],
        },
    )
    assert len(breakdown["exceptions"]) >= 1
    assert "silently dropped" in breakdown["assurance"]
