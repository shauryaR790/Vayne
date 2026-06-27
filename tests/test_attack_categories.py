"""Phase H — attack category classification tests."""

from __future__ import annotations

from pathlib import Path

import networkx as nx

from vayne.attack_paths.classification import classify_attack_path
from vayne.attack_paths.discovery import discover_attack_paths
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.models.attack_categories import AttackCategory
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

from tests._search_fixtures import add_edge, add_node

METASPLOIT = Path(__file__).parent.parent / "examples" / "metasploit.xml"


def _meta_paths():
    findings, assets = load_scan_files([METASPLOIT])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths, _ = discover_attack_paths(findings, assets, correlated, validations)
    return paths


def test_metasploitable_all_remote_rce():
    paths = _meta_paths()
    assert len(paths) == 4
    assert all(p.attack_category == AttackCategory.REMOTE_RCE.value for p in paths)
    for p in paths:
        proof = p.attack_category_proof
        assert proof["category"] == AttackCategory.REMOTE_RCE.value
        assert "initial_access" in proof["matched_capabilities"]
        assert proof["matched_rules"] == ["verified_rce_chain"]
        assert proof["explanation"]


def test_metasploitable_parity_unchanged():
    paths = _meta_paths()
    assert sorted(p.confidence for p in paths) == [83, 92, 100, 100]
    assert sorted(p.risk_score for p in paths) == [6.5, 7.2, 8.6, 8.6]


def test_cloud_attack_chain():
    g = nx.DiGraph()
    add_node(g, "entry", "endpoint", is_entry=True, capability="initial_access")
    add_node(g, "key", "api_key", capability="credential_access")
    add_node(g, "role", "iam_role", capability="privilege_escalation")
    add_node(g, "db", "rds", capability="data_access")
    add_edge(g, "entry", "key", relationship="exposes", artifact_type="api_key")
    add_edge(g, "key", "role", relationship="grants_assume_role", artifact_type="iam_role_arn")
    add_edge(g, "role", "db", relationship="references", artifact_type="rds_instance")
    path = ["entry", "key", "role", "db"]
    cat, proof, _, _ = classify_attack_path(g, path, path_confidence=90)
    assert cat == AttackCategory.CLOUD_ATTACK.value
    assert "cloud_resource_chain" in proof["matched_rules"]


def test_credential_attack():
    g = nx.DiGraph()
    add_node(g, "entry", "endpoint", is_entry=True, capability="initial_access")
    add_node(g, "cred", "credential", capability="credential_access")
    add_edge(g, "entry", "cred", relationship="exposes", artifact_type="credential")
    path = ["entry", "cred"]
    cat, proof, _, _ = classify_attack_path(g, path)
    assert cat == AttackCategory.CREDENTIAL_ATTACK.value
    assert "credential_access" in proof["matched_capabilities"]


def test_domain_compromise():
    g = nx.DiGraph()
    add_node(g, "entry", "endpoint", is_entry=True, capability="initial_access")
    add_node(g, "dom", "domain", capability="domain_compromise")
    add_edge(g, "entry", "dom", relationship="enables")
    path = ["entry", "dom"]
    cat, proof, _, _ = classify_attack_path(g, path)
    assert cat == AttackCategory.DOMAIN_COMPROMISE.value


def test_lateral_movement():
    g = nx.DiGraph()
    add_node(g, "entry", "endpoint", is_entry=True, capability="initial_access")
    add_node(g, "host_a", "asset", label="10.0.0.1")
    add_node(g, "host_b", "asset", label="10.0.0.2", capability="lateral_movement")
    add_edge(g, "entry", "host_a", relationship="exposed_to")
    add_edge(g, "host_a", "host_b", relationship="reuses_credential_on")
    path = ["entry", "host_a", "host_b"]
    cat, proof, _, _ = classify_attack_path(g, path)
    assert cat == AttackCategory.LATERAL_MOVEMENT.value
    assert "reuses_credential_on" in proof["matched_edges"]


def test_data_exfiltration():
    g = nx.DiGraph()
    add_node(g, "entry", "endpoint", is_entry=True, capability="initial_access")
    add_node(g, "db", "database", capability="data_access")
    add_edge(g, "entry", "db", relationship="references")
    path = ["entry", "db"]
    cat, _, _, _ = classify_attack_path(g, path)
    assert cat == AttackCategory.DATA_EXFILTRATION.value


def test_category_proof_fields_complete():
    paths = _meta_paths()
    for p in paths:
        proof = p.attack_category_proof
        for key in ("category", "matched_rules", "matched_nodes", "matched_capabilities",
                    "matched_edges", "confidence", "explanation"):
            assert key in proof
