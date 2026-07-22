"""Authentication helpers — JWT, API keys, password hashing."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session

from product.backend.config import auth_required, jwt_settings
from product.backend.db.session import get_db
from product.backend.models.auth import ApiKeyORM, TeamMemberORM, TeamORM, UserORM
from product.backend.workspace import get_workspace_header, normalize_workspace_id

API_KEY_PREFIX = "vayne_live_"


@dataclass(frozen=True)
class AuthContext:
    user_id: str | None
    team_id: str
    workspace_id: str
    email: str | None = None
    auth_method: str = "jwt"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120_000,
    )
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest_hex = stored.split("$", 1)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120_000,
    )
    return hmac.compare_digest(digest.hex(), digest_hex)


def create_access_token(*, user_id: str, team_id: str, workspace_id: str, email: str) -> str:
    settings = jwt_settings()
    now = _utcnow()
    payload = {
        "sub": user_id,
        "team_id": team_id,
        "workspace_id": workspace_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=settings["ttl_hours"])).timestamp()),
    }
    return jwt.encode(payload, settings["secret"], algorithm="HS256")


def decode_access_token(token: str) -> AuthContext:
    settings = jwt_settings()
    try:
        payload = jwt.decode(token, settings["secret"], algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc
    return AuthContext(
        user_id=str(payload.get("sub") or ""),
        team_id=str(payload.get("team_id") or ""),
        workspace_id=str(payload.get("workspace_id") or "default"),
        email=str(payload.get("email") or ""),
        auth_method="jwt",
    )


def hash_api_key(raw_key: str) -> str:
    pepper = jwt_settings()["api_key_pepper"]
    return hashlib.sha256(f"{pepper}:{raw_key}".encode("utf-8")).hexdigest()


def generate_api_key() -> tuple[str, str, str]:
    raw = f"{API_KEY_PREFIX}{secrets.token_urlsafe(32)}"
    prefix = raw[:16]
    return raw, prefix, hash_api_key(raw)


def authenticate_user(db: Session, email: str, password: str) -> tuple[UserORM, TeamORM]:
    user = db.query(UserORM).filter(UserORM.email == email.strip().lower()).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    membership = (
        db.query(TeamMemberORM)
        .filter(TeamMemberORM.user_id == user.id)
        .order_by(TeamMemberORM.created_at.asc())
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="User has no team membership")
    team = db.get(TeamORM, membership.team_id)
    if not team:
        raise HTTPException(status_code=403, detail="Team not found")
    return user, team


def register_user(
    db: Session,
    *,
    email: str,
    password: str,
    name: str,
    team_name: str,
) -> tuple[UserORM, TeamORM]:
    normalized = email.strip().lower()
    if db.query(UserORM).filter(UserORM.email == normalized).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    if len(password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    user = UserORM(
        id=str(uuid.uuid4()),
        email=normalized,
        password_hash=hash_password(password),
        name=name.strip() or normalized.split("@", 1)[0],
    )
    team = TeamORM(
        id=str(uuid.uuid4()),
        name=team_name.strip() or f"{user.name}'s team",
        workspace_id=str(uuid.uuid4()),
    )
    membership = TeamMemberORM(
        id=str(uuid.uuid4()),
        team_id=team.id,
        user_id=user.id,
        role="owner",
    )
    db.add(user)
    db.add(team)
    db.add(membership)
    db.commit()
    db.refresh(user)
    db.refresh(team)
    return user, team


def authenticate_api_key(db: Session, raw_key: str) -> AuthContext:
    if not raw_key.startswith(API_KEY_PREFIX):
        raise HTTPException(status_code=401, detail="Invalid API key")
    prefix = raw_key[:16]
    key_hash = hash_api_key(raw_key)
    row = (
        db.query(ApiKeyORM)
        .filter(ApiKeyORM.key_prefix == prefix, ApiKeyORM.key_hash == key_hash)
        .first()
    )
    if not row:
        raise HTTPException(status_code=401, detail="Invalid API key")
    team = db.get(TeamORM, row.team_id)
    if not team:
        raise HTTPException(status_code=401, detail="Invalid API key")
    row.last_used_at = _utcnow()
    db.commit()
    return AuthContext(
        user_id=None,
        team_id=team.id,
        workspace_id=team.workspace_id,
        email=None,
        auth_method="api_key",
    )


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


def resolve_auth_context(
    db: Session,
    authorization: str | None,
) -> AuthContext | None:
    token = _extract_bearer(authorization)
    if not token:
        return None
    if token.startswith(API_KEY_PREFIX):
        return authenticate_api_key(db, token)
    return decode_access_token(token)


def get_auth_context_optional(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> AuthContext | None:
    return resolve_auth_context(db, authorization)


def get_auth_context_required(
    auth: AuthContext | None = Depends(get_auth_context_optional),
) -> AuthContext:
    if auth is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return auth


def resolve_workspace_id(
    auth: AuthContext | None = Depends(get_auth_context_optional),
    header_workspace: str = Depends(get_workspace_header),
) -> str:
    if auth is not None:
        return auth.workspace_id
    if auth_required():
        raise HTTPException(status_code=401, detail="Authentication required")
    return normalize_workspace_id(header_workspace)
