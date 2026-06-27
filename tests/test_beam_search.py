"""Beam search correctness + Metasploitable parity (Phase D)."""

from __future__ import annotations

from pathlib import Path

import pytest

import vayne.attack_paths.discovery as discovery
from vayne.attack_paths.discovery import discover_attack_paths
from vayne.attack_paths.search.beam_search import beam_search
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

from tests._search_fixtures import add_edge, add_node, ctx_for
import networkx as nx

EXAMPLES = Path(__file__).parent.parent / "examples"
METASPLOIT = EXAMPLES / "metasploit.xml"
FIRSTRUN = EXAMPLES / "scan_results" / "firstrun.xml"


def _inputs(scan_path: Path):
    findings, assets = load_scan_files([scan_path])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    return findings, assets, correlated, validations


def _signature(paths):
    return [
        (tuple(n.id for n in p.nodes), p.confidence, round(p.risk_score, 1))
        for p in paths
    ]


def _run(scan_path, monkeypatch, mode):
    monkeypatch.setattr(discovery, "SEARCH_MODE", mode)
    findings, assets, correlated, validations = _inputs(scan_path)
    return discover_attack_paths(findings, assets, correlated, validations)


# --------------------------------------------------------------------------- #
# Metasploitable parity                                                        #
# --------------------------------------------------------------------------- #

def test_metasploitable_exact_paths(monkeypatch):
    paths, _ = _run(METASPLOIT, monkeypatch, "beam")
    assert len(paths) == 4
    assert sorted(p.confidence for p in paths) == [83, 92, 100, 100]
    assert sorted(round(p.risk_score, 1) for p in paths) == [6.5, 7.2, 8.6, 8.6]


def test_beam_matches_legacy_metasploitable(monkeypatch):
    beam, _ = _run(METASPLOIT, monkeypatch, "beam")
    legacy, _ = _run(METASPLOIT, monkeypatch, "all_simple_paths")
    assert _signature(beam) == _signature(legacy)


def test_beam_matches_legacy_firstrun(monkeypatch):
    beam, _ = _run(FIRSTRUN, monkeypatch, "beam")
    legacy, _ = _run(FIRSTRUN, monkeypatch, "all_simple_paths")
    assert _signature(beam) == _signature(legacy) == []


def test_beam_is_default_algorithm(monkeypatch):
    _, proof = _run(METASPLOIT, monkeypatch, "beam")
    assert "beam search" in proof.path_discovery.algorithm


def test_beam_records_search_telemetry(monkeypatch):
    _, proof = _run(METASPLOIT, monkeypatch, "beam")
    pd = proof.path_discovery
    assert pd.search_states_expanded > 0
    # Open ports / services without verified exploits are dead-ends → pruned.
    assert pd.search_branches_pruned > 0


# --------------------------------------------------------------------------- #
# Synthetic: beam reaches the right targets                                    #
# --------------------------------------------------------------------------- #

def test_beam_finds_credentialed_data_path():
    g = nx.DiGraph()
    add_node(g, "entry:internet", "endpoint", is_entry=True)
    add_node(g, "vuln:a", "vulnerability", applicability_status="verified")
    add_node(g, "cred:a", "credential")
    add_node(g, "id:a", "identity")
    add_node(g, "db:a", "database")
    add_edge(g, "entry:internet", "vuln:a")
    add_edge(g, "vuln:a", "cred:a")
    add_edge(g, "cred:a", "id:a")
    add_edge(g, "id:a", "db:a")

    ctx = ctx_for(g, {"db:a"})
    results = beam_search(ctx, ["entry:internet"])
    assert ["entry:internet", "vuln:a", "cred:a", "id:a", "db:a"] in results


def test_beam_omits_unreachable_target():
    g = nx.DiGraph()
    add_node(g, "entry:internet", "endpoint", is_entry=True)
    add_node(g, "vuln:a", "vulnerability")
    add_node(g, "db:a", "database")  # target, but not connected
    add_edge(g, "entry:internet", "vuln:a")
    ctx = ctx_for(g, {"db:a"})
    results = beam_search(ctx, ["entry:internet"])
    assert results == []
