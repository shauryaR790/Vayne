"""Tests for strict host-scoped evidence graph."""

from pathlib import Path

from vayne.attack_paths.discovery import build_security_graph, discover_attack_paths
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.models import Classification
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

EXAMPLES = Path(__file__).parent.parent / "examples" / "scan_results"


def test_services_are_host_scoped():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    _, proof = discover_attack_paths(findings, assets, correlated, validations)

    service_nodes = [n for n in proof.nodes if n.node_type == "service"]
    assert service_nodes
    for n in service_nodes:
        assert n.id.startswith("service:") and n.id.count(":") >= 2
        host = n.id.split(":")[1]
        assert host in n.label or host in n.id

    hosts_by_service = {n.id.split(":")[1] for n in service_nodes}
    if len(hosts_by_service) >= 2:
        edge_svc = next(n for n in service_nodes if "edge.example.com" in n.id)
        assets_svc = next(n for n in service_nodes if "assets.example.com" in n.id)
        assert edge_svc.id != assets_svc.id


def test_software_deduped_per_host():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    _, proof = discover_attack_paths(findings, assets, correlated, validations)

    sw = [n for n in proof.nodes if n.node_type == "software" and "edge.example.com" in n.id]
    labels = {n.label for n in sw}
    assert not ({"Apache", "Apache httpd 2.4.49"}.issubset(labels) and len(labels) > 1)
    assert any("apache" in l.lower() and "2.4.49" in l for l in labels)


def test_no_inventory_vuln_nodes():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    _, proof = discover_attack_paths(findings, assets, correlated, validations)

    vuln_labels = {n.label for n in proof.nodes if n.node_type == "vulnerability"}
    banned = {"Publicly accessible host", "Open port 443", "Open port 8080"}
    for b in banned:
        assert b not in vuln_labels
    assert not any(l.startswith("Discovered endpoint") for l in vuln_labels)


def test_cgi_path_is_endpoint_not_bucket():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    _, proof = discover_attack_paths(findings, assets, correlated, validations)

    for n in proof.nodes:
        if "cgi-bin" in n.label.lower():
            assert n.node_type == "endpoint"
            assert not n.label.startswith("bucket:")


def test_explores_many_candidate_paths():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    _, proof = discover_attack_paths(findings, assets, correlated, validations)
    pd = proof.path_discovery
    assert pd is not None
    assert pd.raw_paths_enumerated >= 2
