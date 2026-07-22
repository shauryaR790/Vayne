"""FastAPI dependencies shared across product routes."""

from __future__ import annotations

from fastapi import Depends
from sqlalchemy.orm import Session

from product.backend.config import get_storage_root
from product.backend.db.session import get_db
from product.backend.services.investigation_service import InvestigationService
from product.backend.workspace import get_workspace_id


def get_investigation_service(
    db: Session = Depends(get_db),
    workspace_id: str = Depends(get_workspace_id),
) -> InvestigationService:
    return InvestigationService(db, get_storage_root(), workspace_id=workspace_id)
