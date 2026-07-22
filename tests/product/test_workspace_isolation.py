"""Workspace isolation and production hardening tests."""

from __future__ import annotations


def test_workspace_isolation(product_client, metasploit_path):
    client, _ = product_client
    headers_a = {"X-Vayne-Workspace-Id": "workspace-alpha"}
    headers_b = {"X-Vayne-Workspace-Id": "workspace-beta"}

    with metasploit_path.open("rb") as f:
        resp = client.post(
            "/api/analyze",
            data={"name": "alpha-run"},
            files={"files": ("metasploit.xml", f, "application/xml")},
            headers=headers_a,
        )
    assert resp.status_code == 200, resp.text
    inv_id = resp.json()["investigation_id"]

    list_b = client.get("/api/investigations", headers=headers_b).json()
    assert all(row["id"] != inv_id for row in list_b["investigations"])

    detail_b = client.get(f"/api/investigation/{inv_id}", headers=headers_b)
    assert detail_b.status_code == 404

    list_a = client.get("/api/investigations", headers=headers_a).json()
    assert any(row["id"] == inv_id for row in list_a["investigations"])


def test_dev_tools_disabled_by_default(product_client, monkeypatch):
    client, _ = product_client
    monkeypatch.delenv("VAYNE_DEV_TOOLS", raising=False)
    resp = client.post("/api/dev/reset-workspace")
    assert resp.status_code == 403


def test_upload_rejects_too_many_files(product_client, monkeypatch):
    client, _ = product_client
    monkeypatch.setenv("VAYNE_MAX_UPLOAD_FILES", "2")
    files = [
        ("files", ("a.xml", b"<root/>", "application/xml")),
        ("files", ("b.xml", b"<root/>", "application/xml")),
        ("files", ("c.xml", b"<root/>", "application/xml")),
    ]
    resp = client.post("/api/analyze", files=files)
    assert resp.status_code == 413
    assert resp.json()["error_kind"] == "upload_limit"
