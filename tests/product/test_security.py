"""Security hardening tests."""

from __future__ import annotations

import pytest


def test_registration_disabled_in_production(product_client, monkeypatch):
    client, _ = product_client
    monkeypatch.setenv("VAYNE_ENV", "production")
    monkeypatch.setenv("VAYNE_JWT_SECRET", "x" * 40)
    monkeypatch.setenv("VAYNE_API_KEY_PEPPER", "y" * 40)

    resp = client.post(
        "/api/auth/register",
        json={
            "email": "blocked@example.com",
            "password": "securepass123",
            "team_name": "Blocked",
        },
    )
    assert resp.status_code == 403


def test_dev_tools_blocked_in_production(product_client, monkeypatch):
    client, _ = product_client
    monkeypatch.setenv("VAYNE_ENV", "production")
    monkeypatch.setenv("VAYNE_DEV_TOOLS", "true")

    resp = client.post("/api/dev/reset-workspace")
    assert resp.status_code in (401, 403)


def test_security_headers_on_api(product_client):
    client, _ = product_client
    resp = client.get("/api/health")
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert resp.headers.get("Cache-Control") == "no-store"


def test_rate_limit_login(product_client, monkeypatch):
    client, _ = product_client
    monkeypatch.setenv("VAYNE_RATE_LIMIT", "true")

    last_status = 200
    for _ in range(12):
        resp = client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "wrongpassword"},
        )
        last_status = resp.status_code
    assert last_status == 429


def test_production_startup_rejects_weak_secret(monkeypatch):
    monkeypatch.setenv("VAYNE_ENV", "production")
    monkeypatch.setenv("VAYNE_JWT_SECRET", "short")
    monkeypatch.setenv("VAYNE_API_KEY_PEPPER", "also-short-and-same-as-jwt")

    from product.backend.security.startup import validate_security_config

    with pytest.raises(RuntimeError):
        validate_security_config()
