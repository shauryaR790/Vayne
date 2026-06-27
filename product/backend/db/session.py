"""Database session factory."""

from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from product.backend.db.base import Base

DEFAULT_URL = "postgresql://vayne:vayne@localhost:5432/vayne"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_URL)

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


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
