"""Attack path tests."""

from pathlib import Path

import networkx as nx

from vayne.attack_paths.graph import build_graph, discover_attack_paths
from vayne.correlator.engine import correlate_findings
from vayne.parsers.loader import load_scan_files

EXAMPLES = Path(__file__).parent.parent / "examples" / "scan_results"


def test_discover_paths():
    findings, _ = load_scan_files([EXAMPLES])
    correlated = correlate_findings(findings)
    paths = discover_attack_paths(correlated)
    assert len(paths) >= 1
    assert paths[0].nodes


def test_networkx_graph():
    findings, _ = load_scan_files([EXAMPLES])
    correlated = correlate_findings(findings)
    paths = discover_attack_paths(correlated)
    g = build_graph(paths)
    assert isinstance(g, nx.DiGraph)
    assert g.number_of_nodes() >= 2
