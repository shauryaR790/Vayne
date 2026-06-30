"""Load repo-root environment for CLI scripts and the API."""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def default_database_url() -> str:
    db_path = REPO_ROOT / "product" / "storage" / "vayne_dev.db"
    return f"sqlite:///{db_path.as_posix()}"


def default_storage_root() -> Path:
    return REPO_ROOT / "product" / "storage" / "investigations"


def load_repo_env() -> None:
    """Load `.env` and apply SQLite dev defaults when unset."""
    from dotenv import load_dotenv

    load_dotenv(REPO_ROOT / ".env")

    if not os.getenv("DATABASE_URL", "").strip():
        os.environ["DATABASE_URL"] = default_database_url()
    if not os.getenv("VAYNE_STORAGE", "").strip():
        os.environ["VAYNE_STORAGE"] = str(default_storage_root())
