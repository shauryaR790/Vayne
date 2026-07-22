"""Product API integration test fixtures."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

METASPLOIT = Path(__file__).resolve().parents[2] / "examples" / "metasploit.xml"


@pytest.fixture
def product_client(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    storage = tmp_path / "storage"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path.as_posix()}")
    monkeypatch.setenv("VAYNE_STORAGE", str(storage))
    monkeypatch.setenv("VAYNE_ASYNC_ANALYZE", "false")
    monkeypatch.setenv("VAYNE_RATE_LIMIT", "false")
    monkeypatch.delenv("REDIS_URL", raising=False)

    # Fresh imports under test env
    from product.backend.db.session import init_db
    from product.backend.main import app

    init_db()
    with TestClient(app) as client:
        yield client, storage


@pytest.fixture
def metasploit_path():
    assert METASPLOIT.exists(), f"Missing {METASPLOIT}"
    return METASPLOIT
