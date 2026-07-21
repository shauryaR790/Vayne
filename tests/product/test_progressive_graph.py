"""Tests for progressive investigation graph slices."""

from __future__ import annotations

from product.backend.services.investigation_progressive_graph import build_progressive_graph


def _sample_graph():
    return {
        "nodes": [
            {"id": "asset:10.0.0.1", "label": "10.0.0.1", "type": "asset", "risk": 8.0, "finding_ids": ["f1"]},
            {"id": "asset:10.0.0.2", "label": "10.0.0.2", "type": "asset", "risk": 6.0, "finding_ids": ["f1"]},
            {"id": "service:10.0.0.1:22", "label": "service/tcp/22@10.0.0.1", "type": "service", "risk": 4.0},
            {"id": "service:10.0.0.1:80", "label": "service/tcp/80@10.0.0.1", "type": "service", "risk": 4.0},
            {"id": "vuln:CVE-2024-0001", "label": "CVE-2024-0001", "type": "vulnerability", "risk": 9.0, "finding_ids": ["f1"]},
        ],
        "edges": [
            {"source": "asset:10.0.0.1", "target": "service:10.0.0.1:22", "relationship": "runs"},
            {"source": "asset:10.0.0.1", "target": "service:10.0.0.1:80", "relationship": "runs"},
            {"source": "service:10.0.0.1:80", "target": "vuln:CVE-2024-0001", "relationship": "confirms_applicability"},
        ],
        "attack_paths": [
            {
                "id": "p1",
                "title": "Internet RCE",
                "steps": ["internet", "apache", "rce"],
                "confidence": 80,
                "risk": 8.5,
                "finding_ids": ["f1"],
            }
        ],
    }


def _sample_workbench():
    return {
        "investigations": [
            {
                "id": "cve:CVE-2024-0001|10.0.0.1",
                "title": "Internet-Facing Remote Code Execution",
                "tier": "Critical",
                "risk_score": 88,
                "confidence": 88,
                "reason": "CVE corroborated across scanners",
                "finding_ids": ["f1"],
                "affected_assets": ["10.0.0.1", "10.0.0.2"],
                "cluster_type": "cve",
            }
        ],
        "confirmed_findings": [],
    }


def test_level_1_shows_clusters_only():
    result = build_progressive_graph(graph=_sample_graph(), workbench=_sample_workbench(), level=1)
    assert result["level"] == 1
    assert len(result["nodes"]) == 1
    assert result["nodes"][0]["type"] == "investigation_cluster"
    assert result["statistics"]["hidden_nodes"] >= 4


def test_level_2_expands_assets_with_subnet_grouping():
    inv_id = "cve:CVE-2024-0001|10.0.0.1"
    result = build_progressive_graph(
        graph=_sample_graph(),
        workbench=_sample_workbench(),
        level=2,
        parent_id=f"cluster:{inv_id}",
    )
    assert result["level"] == 2
    labels = [n["label"] for n in result["nodes"]]
    assert any("10.0.0" in lbl for lbl in labels)


def test_level_3_collapses_duplicate_services():
    result = build_progressive_graph(
        graph=_sample_graph(),
        workbench=_sample_workbench(),
        level=3,
        parent_id="asset:10.0.0.1",
    )
    assert result["level"] == 3
    assert any(n["type"] == "service_cluster" or n["type"] == "service" for n in result["nodes"])


def test_level_4_attack_paths_only():
    result = build_progressive_graph(
        graph=_sample_graph(),
        workbench=_sample_workbench(),
        level=4,
        parent_id="asset:10.0.0.1",
    )
    assert result["level"] == 4
    assert any(n["type"] == "attack_path" for n in result["nodes"])
