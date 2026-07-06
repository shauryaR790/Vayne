"""Developer-only workspace utilities."""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from product.backend.config import get_storage_root
from product.backend.db.session import get_db
from product.backend.services.investigation_service import InvestigationService

router = APIRouter(prefix="/api/dev", tags=["developer"])


def _dev_tools_enabled() -> bool:
    return os.getenv("VAYNE_DEV_TOOLS", "true").lower() in ("1", "true", "yes")


@router.post("/reset-workspace")
def reset_workspace(db: Session = Depends(get_db)) -> dict:
    if not _dev_tools_enabled():
        raise HTTPException(status_code=403, detail="Developer tools are disabled")

    svc = InvestigationService(db, get_storage_root())
    stats = svc.reset_workspace()
    return {"status": "ok", **stats}
