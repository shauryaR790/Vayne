"""Product shell integration tests — Metasploitable parity via API."""

from __future__ import annotations

import json


def test_api_health(product_client):
    client, _ = product_client
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_upload_metasploit_four_paths(product_client, metasploit_path):
    client, storage = product_client
    with metasploit_path.open("rb") as f:
        resp = client.post(
            "/api/analyze",
            data={"name": "metasploit-api-test"},
            files={"files": ("metasploit.xml", f, "application/xml")},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "complete"
    inv_id = body["investigation_id"]

    detail = client.get(f"/api/investigation/{inv_id}")
    assert detail.status_code == 200
    data = detail.json()
    assert data["summary"]["path_count"] == 4
    assert len(data["attack_paths"]) == 4


def test_metasploit_confidence_parity(product_client, metasploit_path):
    client, _ = product_client
    with metasploit_path.open("rb") as f:
        resp = client.post(
            "/api/analyze",
            files={"files": ("metasploit.xml", f, "application/xml")},
        )
    inv_id = resp.json()["investigation_id"]
    detail = client.get(f"/api/investigation/{inv_id}").json()
    confidences = sorted(p["confidence"] for p in detail["attack_paths"])
    assert confidences == [83, 92, 100, 100]


def test_metasploit_risk_parity(product_client, metasploit_path):
    client, _ = product_client
    with metasploit_path.open("rb") as f:
        resp = client.post(
            "/api/analyze",
            files={"files": ("metasploit.xml", f, "application/xml")},
        )
    inv_id = resp.json()["investigation_id"]
    detail = client.get(f"/api/investigation/{inv_id}").json()
    risks = sorted(round(p["risk"], 1) for p in detail["attack_paths"])
    assert risks == [6.5, 7.2, 8.6, 8.6]


def test_metasploit_attack_surface_critical(product_client, metasploit_path):
    client, _ = product_client
    with metasploit_path.open("rb") as f:
        resp = client.post(
            "/api/analyze",
            files={"files": ("metasploit.xml", f, "application/xml")},
        )
    inv_id = resp.json()["investigation_id"]
    detail = client.get(f"/api/investigation/{inv_id}").json()
    assert detail["attack_surface"]["classification"].lower() == "critical"
    assert detail["attack_surface"]["score"] > 60


def test_artifacts_exist_on_disk(product_client, metasploit_path):
    client, storage = product_client
    with metasploit_path.open("rb") as f:
        resp = client.post(
            "/api/analyze",
            files={"files": ("metasploit.xml", f, "application/xml")},
        )
    inv_id = resp.json()["investigation_id"]
    export_dir = storage / inv_id
    for name in ("graph.json", "attack_paths.json", "proof.txt"):
        assert (export_dir / name).exists(), f"missing {name}"


def test_investigation_api_matches_engine_output(product_client, metasploit_path):
    client, storage = product_client
    with metasploit_path.open("rb") as f:
        resp = client.post(
            "/api/analyze",
            files={"files": ("metasploit.xml", f, "application/xml")},
        )
    inv_id = resp.json()["investigation_id"]
    api_paths = client.get(f"/api/investigation/{inv_id}").json()["attack_paths"]
    engine_paths = json.loads((storage / inv_id / "attack_paths.json").read_text(encoding="utf-8"))

    api_conf = sorted(p["confidence"] for p in api_paths)
    engine_conf = sorted(p["confidence"] for p in engine_paths)
    assert api_conf == engine_conf == [83, 92, 100, 100]

    api_risk = sorted(round(p["risk"], 1) for p in api_paths)
    engine_risk = sorted(round(p["risk"], 1) for p in engine_paths)
    assert api_risk == engine_risk == [6.5, 7.2, 8.6, 8.6]

    categories = {p["category"] for p in api_paths}
    assert categories == {"remote_rce"}


def test_graph_endpoint(product_client, metasploit_path):
    client, _ = product_client
    with metasploit_path.open("rb") as f:
        resp = client.post(
            "/api/analyze",
            files={"files": ("metasploit.xml", f, "application/xml")},
        )
    inv_id = resp.json()["investigation_id"]
    graph = client.get(f"/api/investigation/{inv_id}/graph").json()
    assert len(graph["nodes"]) > 0
    assert len(graph["edges"]) > 0


def test_path_detail_and_proof(product_client, metasploit_path):
    client, _ = product_client
    with metasploit_path.open("rb") as f:
        resp = client.post(
            "/api/analyze",
            files={"files": ("metasploit.xml", f, "application/xml")},
        )
    inv_id = resp.json()["investigation_id"]
    paths = client.get(f"/api/investigation/{inv_id}").json()["attack_paths"]
    path_id = paths[0]["id"]
    detail = client.get(f"/api/path/{path_id}").json()
    assert detail["story"]
    assert detail["confidence"]["score"] in (83, 92, 100)

    proof = client.get(f"/api/investigation/{inv_id}/proof")
    assert proof.status_code == 200
    assert "PROOF" in proof.text.upper()


def test_duplicate_analysis_reuses_investigation(product_client, metasploit_path, capsys):
    client, storage = product_client
    with metasploit_path.open("rb") as f:
        first = client.post(
            "/api/analyze",
            data={"name": "metasploit-dedup-test"},
            files={"files": ("metasploit.xml", f, "application/xml")},
        )
    assert first.status_code == 200, first.text
    first_id = first.json()["investigation_id"]

    with metasploit_path.open("rb") as f:
        second = client.post(
            "/api/analyze",
            data={"name": "metasploit-dedup-test-again"},
            files={"files": ("metasploit.xml", f, "application/xml")},
        )
    assert second.status_code == 200, second.text
    second_id = second.json()["investigation_id"]

    assert first_id == second_id

    listed = client.get("/api/investigations").json()["investigations"]
    matching = [row for row in listed if row["id"] == first_id]
    assert len(matching) == 1

    captured = capsys.readouterr()
    assert "existing investigation found" in captured.out

    inv_dirs = [p for p in storage.iterdir() if p.is_dir() and not p.name.startswith("_work_")]
    assert len(inv_dirs) == 1


def test_separate_mode_creates_multiple_investigations(product_client, metasploit_path):
    client, storage = product_client
    payload = metasploit_path.read_bytes()
    resp = client.post(
        "/api/analyze",
        data={"name": "separate-test", "mode": "separate"},
        files=[
            ("files", ("scan-a.xml", payload, "application/xml")),
            ("files", ("scan-b.xml", payload, "application/xml")),
        ],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mode"] == "separate"
    assert len(body["investigations"]) == 2
    ids = {item["investigation_id"] for item in body["investigations"]}
    assert len(ids) == 2
    assert body["investigation_group_id"]

    for inv_id in ids:
        detail = client.get(f"/api/investigation/{inv_id}").json()
        assert detail["summary"]["path_count"] == 4

    inv_dirs = [p for p in storage.iterdir() if p.is_dir() and not p.name.startswith("_work_")]
    assert len(inv_dirs) == 2

