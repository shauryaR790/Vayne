"""Phase I — production export artifact tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tests._production_fixtures import METASPLOIT, parity_signature, run_metasploit_export

REQUIRED_FILES = (
    "investigation.json",
    "attack_paths.json",
    "graph.json",
    "findings.json",
    "executive_report.md",
    "analyst_report.md",
    "attack_story.md",
    "remediation_plan.md",
    "proof.txt",
)


@pytest.fixture
def exported(tmp_path):
    return run_metasploit_export(tmp_path)


def test_all_production_files_exist(exported):
    _, export_dir = exported
    for name in REQUIRED_FILES:
        assert (export_dir / name).exists(), f"missing {name}"


def test_attack_paths_json_shape(exported):
    report, export_dir = exported
    data = json.loads((export_dir / "attack_paths.json").read_text(encoding="utf-8"))
    assert len(data) == len(report.attack_paths)
    for item, path in zip(data, report.attack_paths):
        assert item["id"] == path.id
        assert item["attack_category"] == path.attack_category
        assert item["confidence"] == path.confidence
        assert item["risk"] == path.risk_score
        assert item["confidence_proof"]
        assert item["risk_proof"]
        assert item["attack_story"]
        assert item["mitre_tactics"]


def test_graph_json_shape(exported):
    _, export_dir = exported
    graph = json.loads((export_dir / "graph.json").read_text(encoding="utf-8"))
    assert "nodes" in graph
    assert "edges" in graph
    assert len(graph["nodes"]) >= 1
    for node in graph["nodes"]:
        assert "id" in node
        assert "type" in node
        assert "position_hint" in node


def test_findings_json_shape(exported):
    report, export_dir = exported
    data = json.loads((export_dir / "findings.json").read_text(encoding="utf-8"))
    assert "validated" in data
    assert "rejected" in data
    assert len(data["validated"]) + len(data["rejected"]) == len(report.findings)


def test_metasploitable_parity_after_export(exported):
    report, _ = exported
    sig = parity_signature(report)
    assert sig["path_count"] == 4
    assert sig["confidences"] == [83, 92, 100, 100]
    assert sig["risks"] == [6.5, 7.2, 8.6, 8.6]
