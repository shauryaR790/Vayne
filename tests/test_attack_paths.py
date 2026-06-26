"""Attack path tests — validated paths only."""

from pathlib import Path

import networkx as nx

from vayne.attack_paths.discovery import build_security_graph, discover_attack_paths
from vayne.attack_paths.formulas import MIN_PATH_CONFIDENCE
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.models import Classification
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

EXAMPLES = Path(__file__).parent.parent / "examples" / "scan_results"


def _paths(*args, **kwargs):
    paths, _proof = discover_attack_paths(*args, **kwargs)
    return paths


def test_discover_paths_from_evidence():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths = _paths(findings, assets, correlated, validations)
    validated = sum(
        1
        for v in validations.values()
        if v.classification
        in (Classification.CONFIRMED, Classification.LIKELY_EXPLOITABLE)
    )
    if validated == 0:
        assert len(paths) == 0
        return
    assert len(paths) >= 1
    assert paths[0].confidence >= MIN_PATH_CONFIDENCE
    for edge in paths[0].edges:
        assert edge.source_finding_id
        assert edge.evidence
        assert edge.discovered_from
        assert edge.validation_checks_passed
        assert edge.confidence_contribution >= MIN_PATH_CONFIDENCE


def test_risk_aligned_with_confidence():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths = _paths(findings, assets, correlated, validations)
    for p in paths:
        assert p.confidence >= MIN_PATH_CONFIDENCE
        assert p.risk_score <= 10.0
        if p.scoring and p.scoring.risk_score_calculation:
            assert "exploitability=" in p.scoring.risk_score_calculation


def test_low_confidence_paths_excluded():
    findings, assets = load_scan_files([EXAMPLES / "nuclei.json"])
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths = _paths(findings, assets, correlated, validations)
    for p in paths:
        assert p.confidence >= MIN_PATH_CONFIDENCE


def test_attacker_effort_by_hops():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths = _paths(findings, assets, correlated, validations)
    for p in paths:
        if p.hop_count == 1:
            assert p.attacker_effort == "trivial"
        elif p.hop_count <= 3:
            assert p.attacker_effort == "low"
        elif p.hop_count <= 5:
            assert p.attacker_effort == "moderate"
        else:
            assert p.attacker_effort == "high"


def test_s3_chain_db_requires_connection_string_artifact():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths, proof = discover_attack_paths(findings, assets, correlated, validations)

    cross_host_edges = [
        e for e in proof.edges
        if e.accepted
        and e.relationship == "connects_to"
        and "db.example.com" in e.target
    ]
    for edge in cross_host_edges:
        assert edge.artifact_type in (
            "connection_string",
            "env_variable",
        ), f"Cross-host edge must cite artifact, got {edge.artifact_type}"
        assert any(
            "postgres://" in d.lower() or "database_url" in d.lower()
            for d in edge.discovered_from
        )

    s3_paths = [p for p in paths if any("S3" in n.label or "s3" in n.label.lower() for n in p.nodes)]
    for p in s3_paths:
        db_edges = [
            e for e in p.edges
            if "db.example.com" in e.target_id or "db.example.com" in e.evidence
        ]
        for e in db_edges:
            assert e.artifact_type in ("connection_string", "env_variable")


def test_no_iam_without_privilege_evidence():
    findings, assets = load_scan_files([EXAMPLES / "nuclei.json"])
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths = _paths(findings, assets, correlated, validations)
    for p in paths:
        assert all(n.node_type.value != "identity" for n in p.nodes)


def test_iam_node_uses_arn_not_generic_label():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    _, proof = discover_attack_paths(findings, assets, correlated, validations)
    iam_nodes = [n for n in proof.nodes if n.node_type == "identity"]
    for n in iam_nodes:
        assert "arn:aws:iam::" in n.label


def test_security_graph():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    g = build_security_graph(findings, assets, correlated, validations)
    assert isinstance(g, nx.DiGraph)
    assert g.number_of_edges() >= 1


def test_no_semantic_bridge_nodes():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    _, proof = discover_attack_paths(findings, assets, correlated, validations)
    banned = {"s3", "aws", "iam", "database", "production", "target", "cloud"}
    for n in proof.nodes:
        if n.node_type in ("asset", "endpoint", "service"):
            continue
        label = n.label.lower().strip()
        assert label not in banned, f"semantic bridge node: {n.label}"
        if n.node_type == "identity":
            assert label.startswith("arn:aws:iam::")
        if n.node_type == "data":
            assert any(
                x in label
                for x in ("bucket:", "postgres://", "mysql://", "database_url")
            ) or n.node_type == "bucket"
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    _, proof = discover_attack_paths(findings, assets, correlated, validations)
    lines = proof.log_lines()
    assert any("networkx.all_simple_paths" in l for l in lines)
    assert any("Nodes discovered:" in l for l in lines)
