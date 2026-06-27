"""Graph normalization tests."""

from pathlib import Path

from vayne.attack_paths.discovery import discover_attack_paths
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.models import Classification, NodeType
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

EXAMPLES = Path(__file__).parent.parent / "examples" / "scan_results"
PRIMITIVE_LABELS = {"443", "5432", "2.4.49", "unknown"}
# Node types are the full typed contract (Step A) plus Phase C intel domains.
ALLOWED_NODE_TYPES = {nt.value for nt in NodeType}


def test_no_primitive_node_labels():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    _, proof = discover_attack_paths(findings, assets, correlated, validations)

    for n in proof.nodes:
        assert n.label.lower() not in PRIMITIVE_LABELS
        assert "unknown" not in n.id.lower()
        assert n.node_type in ALLOWED_NODE_TYPES


def test_vulnerability_not_terminal():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    _, proof = discover_attack_paths(findings, assets, correlated, validations)
    pd = proof.path_discovery
    assert pd is not None
    assert not any(t.startswith("vuln:") for t in pd.terminal_nodes)


def test_path_order_software_before_vuln_before_endpoint():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths, _ = discover_attack_paths(findings, assets, correlated, validations)
    validated = sum(
        1 for v in validations.values()
        if v.classification in (Classification.CONFIRMED, Classification.LIKELY_EXPLOITABLE)
    )
    if validated == 0 or not paths:
        return
    types = [n.node_type.value for n in paths[0].nodes]
    node_ids = [n.id for n in paths[0].nodes]
    if "vulnerability" in types:
        vuln_idx = types.index("vulnerability")
        target_endpoints = [
            i for i, (t, nid) in enumerate(zip(types, node_ids))
            if t == "endpoint" and nid != "entry:internet"
        ]
        if target_endpoints:
            assert vuln_idx < target_endpoints[-1]
    if "software" in types and "vulnerability" in types:
        assert types.index("software") < types.index("vulnerability")


def test_graph_statistics_present():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    _, proof = discover_attack_paths(findings, assets, correlated, validations)
    assert proof.graph_statistics is not None
    gs = proof.graph_statistics
    assert gs.connected_components >= 1
    assert gs.reachable_nodes >= 1
    assert gs.candidate_attack_paths >= 0
