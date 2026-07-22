"""Tests for investigation contract normalization."""

from __future__ import annotations

from vayne.investigation.contract import (
    filter_analyst_investigations,
    finalize_investigation,
    finalize_investigation_list,
)
from vayne.investigation.summary import build_summary_panel


def test_finalize_investigation_adds_ranking_and_tasks():
    inv = {
        "id": "inv-1",
        "title": "Internet Facing Remote Code Execution",
        "tier": "Critical",
        "risk_score": 88,
        "confidence": 75,
        "priority_reasons": ["Production asset", "Public exploit exists"],
        "immediate_action": "Validate exploitability on internet-facing host",
        "evidence_sources": ["Nessus", "Nmap"],
        "affected_assets": ["web.example.com"],
        "missing_evidence": ["Live reproduction"],
        "quality_score": {"internet_exposure": 80, "business_impact": 70, "exploitability": 65},
        "reasoning_chain": {
            "alternative_explanations": ["Misconfigured reverse proxy only"],
            "recommended_validation": ["Capture service banner"],
        },
        "evidence_ledger": [
            {
                "scanner": "Nessus",
                "filename": "nessus.csv",
                "evidence_id": "f-1",
                "confidence_weight": 82,
                "summary": "CVE-2021-41773",
            }
        ],
    }
    out = finalize_investigation(inv, rank=1)
    assert out["rank"] == 1
    assert out["why_ranked_here"]["headline"].startswith("This investigation is ranked #1")
    assert "Production asset" in out["why_ranked_here"]["bullets"]
    assert out["analyst_tasks"]
    assert out["analyst_tasks"][0]["action"]
    assert out["analyst_tasks"][0]["why"]
    assert out["evidence"][0]["evidence_quality"] == "strong"
    assert out["alternative_explanations"]


def test_finalize_investigation_list_assigns_ranks():
    items = [
        {"id": "a", "tier": "High", "risk_score": 70, "finding_ids": ["f1"], "title": "Credential Theft Opportunity"},
        {"id": "b", "tier": "Medium", "risk_score": 50, "finding_ids": ["f2"], "title": "Weak Authentication"},
    ]
    ranked = finalize_investigation_list(items)
    assert ranked[0]["rank"] == 1
    assert ranked[1]["rank"] == 2


def test_filter_rejects_internal_hypotheses():
    junk = [
        {
            "id": "hyp:0",
            "cluster_type": "hypothesis",
            "title": "False fingerprint / not applicable",
            "tier": "Low",
            "risk_score": 40,
            "finding_ids": [],
        },
        {
            "id": "cve:CVE-2021-41773",
            "cluster_type": "cve",
            "title": "Internet Facing Remote Code Execution",
            "tier": "Critical",
            "risk_score": 88,
            "finding_ids": ["f1"],
            "evidence_sources": ["Nessus"],
        },
    ]
    kept = filter_analyst_investigations(junk)
    assert len(kept) == 1
    assert kept[0]["title"].startswith("Internet Facing")
    panel = build_summary_panel(
        file_count=100,
        investigations=[{"tier": "Critical"}, {"tier": "High"}, {"tier": "Low"}],
        evidence_signals=5000,
        duplicates_removed=1200,
        hours_saved=18.5,
    )
    assert panel["files_uploaded"] == 100
    assert panel["investigations_generated"] == 3
    assert panel["investigations_requiring_immediate_review"] == 2
    assert panel["estimated_analyst_hours_saved"] == 18.5
