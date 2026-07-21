"""SQLAlchemy ORM models for product persistence."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from product.backend.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class InvestigationORM(Base):
    __tablename__ = "investigations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    investigation_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    source_filename: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    investigation_group_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    mode: Mapped[str] = mapped_column(String(16), default="combined")
    group_index: Mapped[int] = mapped_column(Integer, default=0)
    attack_surface_score: Mapped[int] = mapped_column(Integer, default=0)
    attack_surface_classification: Mapped[str] = mapped_column(String(32), default="")
    path_count: Mapped[int] = mapped_column(Integer, default=0)
    critical_count: Mapped[int] = mapped_column(Integer, default=0)
    raw_report_path: Mapped[str] = mapped_column(Text, default="")

    attack_paths: Mapped[list["AttackPathORM"]] = relationship(
        back_populates="investigation",
        cascade="all, delete-orphan",
    )
    graph_nodes: Mapped[list["GraphNodeORM"]] = relationship(
        back_populates="investigation",
        cascade="all, delete-orphan",
    )
    graph_edges: Mapped[list["GraphEdgeORM"]] = relationship(
        back_populates="investigation",
        cascade="all, delete-orphan",
    )
    findings: Mapped[list["FindingORM"]] = relationship(
        back_populates="investigation",
        cascade="all, delete-orphan",
    )


class AttackPathORM(Base):
    __tablename__ = "attack_paths"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    investigation_id: Mapped[str] = mapped_column(String(36), ForeignKey("investigations.id"))
    stable_id: Mapped[str] = mapped_column(String(64), default="")
    engine_path_id: Mapped[str] = mapped_column(String(32), default="")
    confidence: Mapped[int] = mapped_column(Integer, default=0)
    risk: Mapped[float] = mapped_column(Float, default=0.0)
    category: Mapped[str] = mapped_column(String(64), default="")
    mitre: Mapped[str] = mapped_column(Text, default="{}")  # JSON
    story: Mapped[str] = mapped_column(Text, default="{}")  # JSON
    proof: Mapped[str] = mapped_column(Text, default="{}")  # JSON bundle

    investigation: Mapped["InvestigationORM"] = relationship(back_populates="attack_paths")


class GraphNodeORM(Base):
    __tablename__ = "graph_nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    investigation_id: Mapped[str] = mapped_column(String(36), ForeignKey("investigations.id"))
    node_id: Mapped[str] = mapped_column(String(512), nullable=False)
    node_type: Mapped[str] = mapped_column(String(64), default="")
    data: Mapped[str] = mapped_column(Text, default="{}")

    investigation: Mapped["InvestigationORM"] = relationship(back_populates="graph_nodes")


class GraphEdgeORM(Base):
    __tablename__ = "graph_edges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    investigation_id: Mapped[str] = mapped_column(String(36), ForeignKey("investigations.id"))
    source: Mapped[str] = mapped_column(String(512), nullable=False)
    target: Mapped[str] = mapped_column(String(512), nullable=False)
    data: Mapped[str] = mapped_column(Text, default="{}")

    investigation: Mapped["InvestigationORM"] = relationship(back_populates="graph_edges")


class FindingORM(Base):
    __tablename__ = "findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    investigation_id: Mapped[str] = mapped_column(String(36), ForeignKey("investigations.id"))
    finding_id: Mapped[str] = mapped_column(String(128), default="")
    severity: Mapped[str] = mapped_column(String(32), default="")
    classification: Mapped[str] = mapped_column(String(64), default="")
    data: Mapped[str] = mapped_column(Text, default="{}")

    investigation: Mapped["InvestigationORM"] = relationship(back_populates="findings")
