"""Tests for evidence clustering into analyst investigations."""

from __future__ import annotations

from product.backend.services.investigation_clustering import (
    _is_pure_service_observation,
    build_investigation_clusters,
)
from product.backend.services.investigation_prioritization import build_priority_queue


def _apache_rce_findings() -> list[dict]:
    return [
        {
            "id": "f-apache",
            "title": "Apache HTTP Server 2.4.49",
            "host": "web.example.com",
            "severity": "CRITICAL",
            "machine_confidence": 88,
            "classification": "LIKELY_EXPLOITABLE",
            "claim_status": "suspected",
            "cve": "CVE-2021-41773",
            "sources": ["Nmap", "Nessus", "Nuclei"],
            "validated_checks": ["Host alive", "Port open", "Reachable from entry point", "CVE matched"],
            "not_validated_checks": ["Arbitrary command execution"],
            "evidence": ["Apache/2.4.49 on port 443"],
            "business_impact_detail": {"summary": "Customer-facing web tier exposure."},
            "confidence": {"kind": "correlated_vulnerability"},
        },
        {
            "id": "f-http",
            "title": "http",
            "host": "web.example.com",
            "severity": "info",
            "machine_confidence": 45,
            "classification": "OBSERVED",
            "claim_status": "observed",
            "sources": ["Nmap"],
            "validated_checks": ["Port open"],
            "confidence": {"kind": "service_observation"},
        },
        {
            "id": "f-https",
            "title": "https",
            "host": "web.example.com",
            "severity": "info",
            "machine_confidence": 42,
            "classification": "OBSERVED",
            "claim_status": "observed",
            "sources": ["Nmap"],
            "confidence": {"kind": "service_observation"},
        },
    ]


def test_pure_service_observations_are_filtered():
    findings = _apache_rce_findings()
    assert _is_pure_service_observation(findings[1])
    assert _is_pure_service_observation(findings[2])
    assert not _is_pure_service_observation(findings[0])


def test_clusters_merge_service_observations_into_cve_investigation():
    clusters = build_investigation_clusters(
        confirmed_findings=_apache_rce_findings(),
        candidate_paths=[],
        hypotheses=[],
    )
    assert clusters
    top = clusters[0]
    assert "Apache" in top["title"] or "Remote Code Execution" in top["title"]
    assert top["kind"] == "investigation"
    assert len(top["finding_ids"]) >= 1
    assert "Nmap" in top["evidence_sources"]
    assert "web.example.com" in top["affected_assets"]
    assert not top["title"].lower().startswith("http on")
    assert not top["title"].lower().startswith("ssh on")


def test_priority_queue_uses_investigations_not_services():
    findings = _apache_rce_findings() + [
        {
            "id": "f-ssh",
            "title": "ssh OpenSSH 4.7p1",
            "host": "10.0.0.5",
            "severity": "info",
            "machine_confidence": 40,
            "classification": "OBSERVED",
            "claim_status": "observed",
            "sources": ["Nmap"],
            "confidence": {"kind": "service_observation"},
        },
    ]
    queue = build_priority_queue(
        confirmed_findings=findings,
        candidate_paths=[],
        hypotheses=[],
    )
    titles = [item["title"].lower() for item in queue]
    assert not any(t.startswith("ssh") for t in titles)
    assert not any(t.startswith("http on") for t in titles)
    assert queue[0]["kind"] == "investigation"
    assert queue[0].get("immediate_action")


def test_attack_path_cluster_gets_chain_title():
    path = {
        "steps": ["internet", "apache rce", "privilege escalation"],
        "status": "VALIDATED",
        "confidence": 82,
        "risk": 8.5,
    }
    clusters = build_investigation_clusters(
        confirmed_findings=_apache_rce_findings()[:1],
        candidate_paths=[path],
        hypotheses=[],
    )
    assert any("Privilege" in c["title"] or "Remote Code" in c["title"] for c in clusters)
