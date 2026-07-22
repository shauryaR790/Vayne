"""Auth API routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from product.backend.auth import (
    AuthContext,
    authenticate_user,
    create_access_token,
    generate_api_key,
    get_auth_context_required,
    register_user,
)
from product.backend.db.session import get_db
from product.backend.models.auth import ApiKeyORM

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = ""
    team_name: str = ""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    workspace_id: str
    team_id: str
    team_name: str
    email: str
    name: str


class MeResponse(BaseModel):
    user_id: str | None
    email: str | None
    team_id: str
    workspace_id: str
    auth_method: str


class ApiKeyCreateRequest(BaseModel):
    name: str = "default"


class ApiKeyCreateResponse(BaseModel):
    id: str
    name: str
    key: str
    prefix: str


@router.post("/register", response_model=AuthResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user, team = register_user(
        db,
        email=body.email,
        password=body.password,
        name=body.name,
        team_name=body.team_name,
    )
    token = create_access_token(
        user_id=user.id,
        team_id=team.id,
        workspace_id=team.workspace_id,
        email=user.email,
    )
    return AuthResponse(
        access_token=token,
        workspace_id=team.workspace_id,
        team_id=team.id,
        team_name=team.name,
        email=user.email,
        name=user.name,
    )


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user, team = authenticate_user(db, body.email, body.password)
    token = create_access_token(
        user_id=user.id,
        team_id=team.id,
        workspace_id=team.workspace_id,
        email=user.email,
    )
    return AuthResponse(
        access_token=token,
        workspace_id=team.workspace_id,
        team_id=team.id,
        team_name=team.name,
        email=user.email,
        name=user.name,
    )


@router.get("/me", response_model=MeResponse)
def me(auth: AuthContext = Depends(get_auth_context_required)) -> MeResponse:
    return MeResponse(
        user_id=auth.user_id,
        email=auth.email,
        team_id=auth.team_id,
        workspace_id=auth.workspace_id,
        auth_method=auth.auth_method,
    )


@router.post("/api-keys", response_model=ApiKeyCreateResponse)
def create_api_key(
    body: ApiKeyCreateRequest,
    auth: AuthContext = Depends(get_auth_context_required),
    db: Session = Depends(get_db),
) -> ApiKeyCreateResponse:
    raw, prefix, key_hash = generate_api_key()
    row = ApiKeyORM(
        team_id=auth.team_id,
        name=body.name.strip() or "default",
        key_prefix=prefix,
        key_hash=key_hash,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ApiKeyCreateResponse(id=row.id, name=row.name, key=raw, prefix=prefix)
