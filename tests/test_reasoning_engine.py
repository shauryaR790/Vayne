"""Reasoning engine tests — CVE candidates, prerequisites, criticality, blast radius."""

from pathlib import Path

from vayne.attack_paths.discovery import discover_attack_paths
from vayne.attack_paths.cve_enrichment import applicability_status, lookup_cve_candidates
from vayne.attack_paths.software import parse_software
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

EXAMPLES = Path(__file__).parent.parent / "examples" / "scan_results"


def test_firstrun_cve_candidates_not_direct_exploits():
    findings, assets = load_scan_files([EXAMPLES / "firstrun.xml"])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths, proof = discover_attack_paths(findings, assets, correlated, validations)

    cand_nodes = [n for n in proof.nodes if n.id.startswith("cve_cand:")]
    assert len(cand_nodes) >= 1
    assert all("CANDIDATE" in n.label for n in cand_nodes)

    prereq_nodes = [n for n in proof.nodes if n.id.startswith("prereq:")]
    assert len(prereq_nodes) >= 1, "Apache CVEs require prerequisite nodes"

    cap_nodes = [n for n in proof.nodes if n.id.startswith("exploit:") or n.id.startswith("access:")]
    assert len(cap_nodes) == 0, "No verified exploit without prerequisites on inventory scan"

    assert len(paths) == 0

    pd = proof.path_discovery
    assert pd is not None
    assert pd.paths_rejected >= 1


def test_apache_247_is_candidate_not_confirmed_cve():
    fp = parse_software("Apache httpd 2.4.7")
    assert fp is not None
    records = lookup_cve_candidates(fp)
    assert any(r.cve_id == "CVE-2014-0226" for r in records)
    status, results = applicability_status(records[0], ["Apache httpd 2.4.7"])
    assert status == "candidate"
    assert all(s == "unknown" for _, s, _ in results)


def test_blast_radius_on_graph_nodes():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    _, proof = discover_attack_paths(findings, assets, correlated, validations)
    assert len(proof.nodes) >= 5


def test_edges_have_evidence_tiers():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    _, proof = discover_attack_paths(findings, assets, correlated, validations)
    for e in proof.edges:
        if e.accepted:
            assert e.evidence_tier in ("TIER1", "TIER2", "TIER3")
            assert e.evidence_type
            assert e.evidence_source
