"""Phase H — deterministic MITRE mapping tests."""

from __future__ import annotations

from pathlib import Path

import networkx as nx

from vayne.attack_paths.classification import classify_attack_path
from vayne.attack_paths.classification.mitre import mitre_for_category
from vayne.attack_paths.discovery import discover_attack_paths
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.models.attack_categories import AttackCategory
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

from tests._search_fixtures import add_edge, add_node

METASPLOIT = Path(__file__).parent.parent / "examples" / "metasploit.xml"


def test_remote_rce_mitre():
    tactics, techniques = mitre_for_category(AttackCategory.REMOTE_RCE)
    assert any("TA0001" in t for t in tactics)
    assert any("TA0002" in t for t in tactics)
    assert any("T1190" in t for t in techniques)


def test_credential_attack_mitre():
    tactics, techniques = mitre_for_category(AttackCategory.CREDENTIAL_ATTACK)
    assert any("TA0006" in t for t in tactics)
    assert techniques


def test_cloud_attack_mitre():
    tactics, _ = mitre_for_category(AttackCategory.CLOUD_ATTACK)
    assert any("TA0003" in t for t in tactics)
    assert any("TA0004" in t for t in tactics)
    assert any("TA0008" in t for t in tactics)


def test_domain_compromise_mitre():
    tactics, _ = mitre_for_category(AttackCategory.DOMAIN_COMPROMISE)
    assert len(tactics) == 3


def test_metasploitable_paths_have_mitre():
    findings, assets = load_scan_files([METASPLOIT])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths, _ = discover_attack_paths(findings, assets, correlated, validations)
    for p in paths:
        assert p.mitre_tactics
        assert p.mitre_techniques
        assert any("TA0001" in t for t in p.mitre_tactics)


def test_mitre_populated_from_classifier():
    g = nx.DiGraph()
    add_node(g, "entry", "endpoint", capability="initial_access")
    add_node(g, "cred", "credential", capability="credential_access")
    add_edge(g, "entry", "cred", relationship="exposes")
    _, _, tactics, techniques = classify_attack_path(g, ["entry", "cred"])
    assert tactics
    assert techniques
