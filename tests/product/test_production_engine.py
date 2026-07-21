"""Tests for production investigation engine upgrades."""

from __future__ import annotations

import json
from pathlib import Path

from product.backend.services.investigation_action_plan import build_action_plan
from vayne.correlator.engine import correlate_findings
from vayne.evidence.ledger import build_evidence_ledger
from vayne.false_positive.classifier import estimate_hours_saved
from vayne.models import (
    AnalystBrief,
    Asset,
    Finding,
    InvestigatedFinding,
    RemediationTimeline,
    ValidationResult,
    Classification,
)
from vayne.parsers.cache import ScanLoadResult, compute_input_fingerprint, file_content_hash, load_cached_parse
from vayne.parsers.loader import load_scan_files, parse_file


def test_source_file_stamped_on_parse(tmp_path: Path):
    sample = tmp_path / "nmap_sample.xml"
    sample.write_text(
        '<?xml version="1.0"?><nmaprun scanner="nmap"><host><address addr="10.0.0.1"/>'
        '<ports><port protocol="tcp" portid="22"><state state="open"/>'
        '<service name="ssh" product="OpenSSH" version="8.2"/></port></ports></host></nmaprun>',
        encoding="utf-8",
    )
    findings, assets = parse_file(sample)
    assert findings or assets
    for f in findings:
        assert f.source_file == "nmap_sample.xml"


def test_correlator_merges_by_source_file():
    f1 = Finding(
        id="a",
        host="10.0.0.1",
        port=443,
        title="Apache httpd",
        severity="high",
        source_tool="nmap",
        source_file="scan_a.xml",
        evidence="Apache/2.4.49",
    )
    f2 = Finding(
        id="b",
        host="10.0.0.1",
        port=443,
        title="Apache HTTP Server",
        severity="high",
        source_tool="nessus",
        source_file="scan_b.xml",
        evidence="Apache/2.4.49",
    )
    merged = correlate_findings([f1, f2])
    assert len(merged) == 1
    assert set(merged[0].source_files) == {"scan_a.xml", "scan_b.xml"}
    assert len(merged[0].sources) == 2


def test_incremental_cache_skips_reparse(tmp_path: Path):
    sample = tmp_path / "nessus.csv"
    sample.write_text("Plugin ID,Plugin Name,Severity,Host,Port\n19506,Nessus Scan Info,Info,10.0.0.1,0\n", encoding="utf-8")
    cache_dir = tmp_path / "cache"

    r1 = load_scan_files([sample], cache_dir=cache_dir)
    assert isinstance(r1, ScanLoadResult)
    assert r1.manifest["cache_misses"] == 1

    r2 = load_scan_files([sample], cache_dir=cache_dir)
    assert r2.manifest["cache_hits"] == 1
    assert r2.manifest["cache_misses"] == 0


def test_evidence_ledger_traces_files():
    corr_list = correlate_findings(
        [
            Finding(
                id="1",
                host="web.internal",
                port=443,
                title="CVE-2024-1234",
                cve="CVE-2024-1234",
                severity="medium",
                source_tool="nmap",
                source_file="nmap.xml",
                evidence="TLSv1.0 enabled",
            ),
            Finding(
                id="2",
                host="web.internal",
                port=443,
                title="CVE-2024-1234",
                cve="CVE-2024-1234",
                severity="high",
                source_tool="nessus",
                source_file="nessus.xml",
                evidence="TLSv1.0 enabled",
            ),
        ]
    )
    investigated = [
        InvestigatedFinding(
            correlated=corr_list[0],
            validation=ValidationResult(
                classification=Classification.OBSERVED,
                overall_confidence=62,
            ),
            analyst=AnalystBrief(),
            remediation=RemediationTimeline(),
        )
    ]
    ledger = build_evidence_ledger(investigated)
    assert ledger["total_source_files"] == 2
    assert "nmap.xml" in ledger["entries"][0]["source_files"]
    assert "nessus.xml" in ledger["entries"][0]["source_files"]


def test_action_plan_from_priority_queue():
    plan = build_action_plan(
        priority_queue=[
            {
                "id": "f1",
                "tier": "Critical",
                "title": "Apache RCE",
                "missing_evidence": ["Controlled exploit validation"],
                "claim_status": "suspected",
            }
        ],
        confirmed_findings=[],
        hypotheses=[],
        missing_evidence=[],
        next_actions=[],
    )
    assert plan["tasks"]
    assert plan["immediate_count"] >= 1
    assert "validation" in plan["tasks"][0]["action"].lower() or "Validate" in plan["tasks"][0]["action"]


def test_hours_saved_accounts_for_dedup():
    hours = estimate_hours_saved(500, 20, 45, duplicates_merged=455, investigations_queued=25)
    assert hours > 5


def test_input_fingerprint_stable():
    a = compute_input_fingerprint(["hash1", "hash2"])
    b = compute_input_fingerprint(["hash2", "hash1"])
    assert a == b


def test_corrupt_cache_reparses(tmp_path: Path):
    sample = tmp_path / "test.csv"
    sample.write_text("Plugin ID,Plugin Name,Severity,Host,Port\n19506,Nessus Scan Info,Info,10.0.0.1,0\n", encoding="utf-8")
    cache_dir = tmp_path / "cache"
    digest = file_content_hash(sample)
    bad = cache_dir / "files" / f"{digest}.json"
    bad.parent.mkdir(parents=True, exist_ok=True)
    bad.write_text("", encoding="utf-8")
    findings, assets, from_cache = load_cached_parse(sample, cache_dir, parse_fn=parse_file)
    assert from_cache is False
    assert isinstance(findings, list)
