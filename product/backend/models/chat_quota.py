"""Free-tier Ask VAYNE message quota (server-enforced)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from product.backend.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ChatQuotaORM(Base):
    """Tracks free-tier Ask VAYNE user messages per workspace identity."""

    __tablename__ = "chat_quotas"
    __table_args__ = (UniqueConstraint("quota_key", name="uq_chat_quota_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    quota_key: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    message_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
