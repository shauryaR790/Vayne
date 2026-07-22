"""Per-browser workspace isolation via request header."""

from __future__ import annotations

import re

from fastapi import Header

WORKSPACE_HEADER = "X-Vayne-Workspace-Id"
DEFAULT_WORKSPACE_ID = "default"
_WORKSPACE_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def normalize_workspace_id(raw: str | None) -> str:
    value = (raw or "").strip()
    if value and _WORKSPACE_RE.fullmatch(value):
        return value
    return DEFAULT_WORKSPACE_ID


def get_workspace_header(
    x_vayne_workspace_id: str | None = Header(default=None, alias=WORKSPACE_HEADER),
) -> str:
    return normalize_workspace_id(x_vayne_workspace_id)


def get_workspace_id(
    x_vayne_workspace_id: str | None = Header(default=None, alias=WORKSPACE_HEADER),
) -> str:
    """Deprecated alias — prefer resolve_workspace_id from auth deps."""
    return normalize_workspace_id(x_vayne_workspace_id)
