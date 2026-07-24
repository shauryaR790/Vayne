"""Server-side free-tier chat quota for Ask VAYNE."""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from product.backend.models.chat_quota import ChatQuotaORM

# Hard free-tier cap — includes Ask VAYNE section prompts and free-form chat.
FREE_TIER_MESSAGE_LIMIT = int(os.getenv("VAYNE_FREE_CHAT_LIMIT", "4"))

QUOTA_EXCEEDED_MESSAGE = (
    "**Free tier chat limit reached**\n\n"
    "You've used all 4 Ask VAYNE messages on the free plan "
    "(including section asks). Chat tokens are limited on free tier — "
    "upgrade to continue investigating with the analyst."
)

QUOTA_EXCEEDED_CODE = "quota_exceeded"


@dataclass(frozen=True)
class QuotaStatus:
    allowed: bool
    used: int
    limit: int
    remaining: int


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def build_quota_key(*, workspace_id: str, client_ip: str | None = None) -> str:
    """Stable server identity for quota — never trust client-supplied counters."""
    ws = (workspace_id or "default").strip()[:64] or "default"
    ip = (client_ip or "unknown").strip()[:64]
    # Mix IP so anonymous workspace spoofing alone can't share unlimited quota.
    digest = hashlib.sha256(f"{ws}|{ip}".encode("utf-8")).hexdigest()[:32]
    return f"ws:{ws}:{digest}"


def get_quota_status(db: Session, quota_key: str) -> QuotaStatus:
    row = db.query(ChatQuotaORM).filter(ChatQuotaORM.quota_key == quota_key).one_or_none()
    used = int(row.message_count) if row else 0
    limit = max(0, FREE_TIER_MESSAGE_LIMIT)
    remaining = max(0, limit - used)
    return QuotaStatus(allowed=used < limit, used=used, limit=limit, remaining=remaining)


def consume_chat_quota(db: Session, quota_key: str) -> QuotaStatus:
    """Atomically consume one free-tier message. Returns status after consume (or blocked)."""
    row = db.query(ChatQuotaORM).filter(ChatQuotaORM.quota_key == quota_key).one_or_none()
    if row is None:
        row = ChatQuotaORM(quota_key=quota_key, message_count=0)
        db.add(row)
        db.flush()

    limit = max(0, FREE_TIER_MESSAGE_LIMIT)
    if row.message_count >= limit:
        return QuotaStatus(allowed=False, used=int(row.message_count), limit=limit, remaining=0)

    row.message_count += 1
    row.updated_at = _utcnow()
    db.commit()
    db.refresh(row)
    used = int(row.message_count)
    return QuotaStatus(
        allowed=True,
        used=used,
        limit=limit,
        remaining=max(0, limit - used),
    )
