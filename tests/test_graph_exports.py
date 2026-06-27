"""Phase I — graph visualization export tests."""

from __future__ import annotations

import json

import pytest

from tests._production_fixtures import run_metasploit_export


@pytest.fixture
def graph(tmp_path):
    _, export_dir = run_metasploit_export(tmp_path)
    return json.loads((export_dir / "graph.json").read_text(encoding="utf-8"))


def test_node_visualization_fields(graph):
    for node in graph["nodes"]:
        for key in ("id", "label", "type", "confidence", "criticality", "blast_radius", "group", "position_hint"):
            assert key in node


def test_edge_visualization_fields(graph):
    for edge in graph["edges"]:
        for key in ("source", "target", "confidence", "relationship", "proof"):
            assert key in edge


def test_graph_includes_mitre_on_paths(graph):
    assert "attack_paths" in graph
    if graph["attack_paths"]:
        assert "mitre_tactics" in graph["attack_paths"][0]
