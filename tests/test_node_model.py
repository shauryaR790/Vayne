"""Step A — typed node model + node factory tests."""

from pathlib import Path

from vayne.attack_paths.discovery import build_security_graph
from vayne.attack_paths.node_factory import REQUIRED_NODE_FIELDS, build_node_attrs
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.models import GraphNode, NodeType
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

EXAMPLES = Path(__file__).parent.parent / "examples"
METASPLOIT = EXAMPLES / "metasploit.xml"
FIRSTRUN = EXAMPLES / "scan_results" / "firstrun.xml"


def _graph(scan_path: Path):
    findings, assets = load_scan_files([scan_path])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    return build_security_graph(findings, assets, correlated, validations)


def test_expanded_node_type_enum_has_phase2_types():
    expected = {
        "role", "admin", "domain", "secret", "api_key", "jwt", "ssh_key",
        "storage", "rds", "redis", "message_queue", "internal_service",
        "network_share", "kubernetes", "container", "pod", "iam_role",
        "service_account", "cloud_resource", "github_repo", "ci_cd",
        "pipeline", "webhook", "email", "session", "vpn",
    }
    values = {nt.value for nt in NodeType}
    missing = expected - values
    assert not missing, f"missing node types: {missing}"


def test_graph_node_model_contract():
    node = GraphNode(label="x", node_type="asset")
    dumped = node.model_dump()
    for field in (
        "label", "node_type", "evidence", "finding_ids", "confidence",
        "blast_radius", "capability", "criticality", "source_tool",
        "validation_status", "evidence_tier",
    ):
        assert field in dumped


def test_build_node_attrs_has_required_fields_and_extra():
    attrs = build_node_attrs(
        "software:h:vsftpd:vsftpd:2.3.4",
        label="vsftpd/vsftpd:2.3.4",
        node_type="software",
        evidence=["fingerprint"],
        cvss=9.8,
        vendor="vsftpd",
    )
    for field in REQUIRED_NODE_FIELDS:
        assert field in attrs
    assert attrs["cvss"] == 9.8
    assert attrs["vendor"] == "vsftpd"
    assert attrs["node_type"] == "software"


def test_every_metasploit_node_satisfies_contract():
    g = _graph(METASPLOIT)
    assert g.number_of_nodes() > 0
    for nid, data in g.nodes(data=True):
        for field in REQUIRED_NODE_FIELDS:
            assert field in data, f"node {nid} missing {field}"
        assert data["node_type"] in {nt.value for nt in NodeType}


def test_every_firstrun_node_satisfies_contract():
    g = _graph(FIRSTRUN)
    for nid, data in g.nodes(data=True):
        for field in REQUIRED_NODE_FIELDS:
            assert field in data, f"node {nid} missing {field}"


def test_nodes_carry_criticality_and_blast_radius():
    g = _graph(METASPLOIT)
    access_nodes = [d for _, d in g.nodes(data=True) if d.get("is_exploit_outcome")]
    assert access_nodes
    for d in g.nodes.values():
        assert isinstance(d["blast_radius"], int)
        assert isinstance(d["criticality"], str)


def test_entry_node_validation_status():
    g = _graph(METASPLOIT)
    assert g.nodes["entry:internet"]["validation_status"] == "entry_point"
    assert g.nodes["entry:internet"]["capability"] == "initial_access"


def test_verified_cve_node_marked_verified():
    g = _graph(METASPLOIT)
    verified = [
        d for nid, d in g.nodes(data=True) if nid.startswith("cve_verified:")
    ]
    assert verified
    assert all(d["validation_status"] == "verified" for d in verified)
    assert all(d["confidence"] > 0 for d in verified)
