"""Database session factory."""

from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from product.backend.db.base import Base
from product.backend.env import default_database_url, load_repo_env

load_repo_env()

DATABASE_URL = os.getenv("DATABASE_URL", default_database_url())

# SQLite needs check_same_thread=False for TestClient.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    if DATABASE_URL.startswith("sqlite"):
        # Ensure parent directory exists for file-based SQLite URLs.
        path = DATABASE_URL.split("///", 1)[-1]
        if path and path != ":memory:":
            from pathlib import Path

            Path(path).parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    _ensure_investigation_columns()


def _ensure_investigation_columns() -> None:
    """Lightweight SQLite dev migration for dedup columns."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "investigations" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("investigations")}
    statements: list[str] = []
    if "investigation_key" not in existing:
        statements.append("ALTER TABLE investigations ADD COLUMN investigation_key VARCHAR(64)")
    if "source_filename" not in existing:
        statements.append(
            "ALTER TABLE investigations ADD COLUMN source_filename VARCHAR(512) DEFAULT ''"
        )
    if "summary" not in existing:
        statements.append("ALTER TABLE investigations ADD COLUMN summary TEXT DEFAULT ''")
    if "updated_at" not in existing:
        statements.append("ALTER TABLE investigations ADD COLUMN updated_at DATETIME")
    if "investigation_group_id" not in existing:
        statements.append(
            "ALTER TABLE investigations ADD COLUMN investigation_group_id VARCHAR(36)"
        )
    if "mode" not in existing:
        statements.append(
            "ALTER TABLE investigations ADD COLUMN mode VARCHAR(16) DEFAULT 'combined'"
        )
    if "group_index" not in existing:
        statements.append(
            "ALTER TABLE investigations ADD COLUMN group_index INTEGER DEFAULT 0"
        )
    if not statements:
        pass
    else:
        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))

    _widen_investigation_text_columns()


def _widen_investigation_text_columns() -> None:
    """Postgres prod fix: multi-file uploads exceed VARCHAR(255) on investigations.name."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "investigations" not in inspector.get_table_names():
        return

    if DATABASE_URL.startswith("sqlite"):
        return

    if not DATABASE_URL.startswith("postgresql"):
        return

    cols = {c["name"]: c for c in inspector.get_columns("investigations")}
    name_type = str(cols.get("name", {}).get("type", "")).upper()
    source_type = str(cols.get("source_filename", {}).get("type", "")).upper()
    statements: list[str] = []
    if "VARCHAR" in name_type or "CHARACTER VARYING" in name_type:
        statements.append("ALTER TABLE investigations ALTER COLUMN name TYPE TEXT")
    if source_type and ("VARCHAR" in source_type or "CHARACTER VARYING" in source_type):
        statements.append(
            "ALTER TABLE investigations ALTER COLUMN source_filename TYPE TEXT"
        )
    if not statements:
        return
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
