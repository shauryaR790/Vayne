"""Developer-only workspace utilities."""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException
from product.backend.config import is_production

from product.backend.deps import get_investigation_service
from product.backend.services.investigation_service import InvestigationService

router = APIRouter(prefix="/api/dev", tags=["developer"])


def _dev_tools_enabled() -> bool:
    if is_production():
        return False
    return os.getenv("VAYNE_DEV_TOOLS", "false").lower() in ("1", "true", "yes")


@router.post("/reset-workspace")
def reset_workspace(
    svc: InvestigationService = Depends(get_investigation_service),
) -> dict:
    if not _dev_tools_enabled():
        raise HTTPException(status_code=403, detail="Developer tools are disabled")

    stats = svc.reset_workspace()
    return {"status": "ok", **stats}
