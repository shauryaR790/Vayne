"""Determinism test (Phase D): identical output across 100 runs."""

from __future__ import annotations

from pathlib import Path

import networkx as nx

import vayne.attack_paths.discovery as discovery
from vayne.attack_paths.discovery import discover_attack_paths
from vayne.attack_paths.search.beam_search import beam_search
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

from tests._search_fixtures import add_edge, add_node, ctx_for

METASPLOIT = Path(__file__).parent.parent / "examples" / "metasploit.xml"


def _branchy_graph() -> tuple[nx.DiGraph, list[str]]:
    g = nx.DiGraph()
    add_node(g, "entry:internet", "endpoint", is_entry=True)
    # Multiple verified-exploit branches all reaching credentialed data paths.
    for s in range(6):
        v = f"vuln:{s}"
        c = f"cred:{s}"
        i = f"id:{s}"
        d = f"db:{s}"
        add_node(g, v, "vulnerability", applicability_status="verified")
        add_node(g, c, "credential")
        add_node(g, i, "identity")
        add_node(g, d, "database")
        add_edge(g, "entry:internet", v, conf=80 + s)
        add_edge(g, v, c, conf=70 + s)
        add_edge(g, c, i, conf=75 + s)
        add_edge(g, i, d, conf=85 + s)
    targets = [f"db:{s}" for s in range(6)]
    return g, targets


def test_beam_search_100_runs_identical():
    g, targets = _branchy_graph()
    base = None
    for _ in range(100):
        ctx = ctx_for(g, targets)
        result = beam_search(ctx, ["entry:internet"])
        if base is None:
            base = result
        else:
            assert result == base


def test_discovery_100_runs_identical_metasploitable(monkeypatch):
    monkeypatch.setattr(discovery, "SEARCH_MODE", "beam")
    findings, assets = load_scan_files([METASPLOIT])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}

    base = None
    for _ in range(100):
        paths, _ = discover_attack_paths(findings, assets, correlated, validations)
        sig = [
            (tuple(n.id for n in p.nodes), p.confidence, round(p.risk_score, 1))
            for p in paths
        ]
        if base is None:
            base = sig
        else:
            assert sig == base
