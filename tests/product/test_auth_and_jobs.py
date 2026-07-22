"""Auth and async job tests."""

from __future__ import annotations


def test_register_login_and_team_workspace(product_client):
    client, _ = product_client
    register = client.post(
        "/api/auth/register",
        json={
            "email": "analyst@example.com",
            "password": "securepass123",
            "name": "Analyst",
            "team_name": "Red Team",
        },
    )
    assert register.status_code == 200, register.text
    body = register.json()
    token = body["access_token"]
    workspace_id = body["workspace_id"]
    assert workspace_id
    assert body["team_name"] == "Red Team"

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["workspace_id"] == workspace_id

    login = client.post(
        "/api/auth/login",
        json={"email": "analyst@example.com", "password": "securepass123"},
    )
    assert login.status_code == 200
    assert login.json()["workspace_id"] == workspace_id


def test_auth_scoped_investigations(product_client, metasploit_path):
    client, _ = product_client
    register = client.post(
        "/api/auth/register",
        json={
            "email": "scoped@example.com",
            "password": "securepass123",
            "team_name": "Scoped Team",
        },
    )
    token = register.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with metasploit_path.open("rb") as f:
        resp = client.post(
            "/api/analyze",
            data={"name": "auth-scoped-test"},
            files={"files": ("metasploit.xml", f, "application/xml")},
            headers=headers,
        )
    assert resp.status_code == 200, resp.text
    inv_id = resp.json()["investigation_id"]

    listed = client.get("/api/investigations", headers=headers).json()["investigations"]
    assert any(row["id"] == inv_id for row in listed)

    other = client.get("/api/investigations", headers={"X-Vayne-Workspace-Id": "someone-else"})
    assert all(row["id"] != inv_id for row in other.json()["investigations"])


def test_workbench_cache_written(product_client, metasploit_path):
    client, storage = product_client
    with metasploit_path.open("rb") as f:
        resp = client.post(
            "/api/analyze",
            files={"files": ("metasploit.xml", f, "application/xml")},
        )
    inv_id = resp.json()["investigation_id"]
    cache_path = storage / inv_id / "workbench.json"
    assert cache_path.exists()

    first = client.get(f"/api/investigation/{inv_id}/workbench").json()
    second = client.get(f"/api/investigation/{inv_id}/workbench").json()
    assert first["investigations"] == second["investigations"]
