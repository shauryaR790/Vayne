"""Analysis job status endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from product.backend.auth import resolve_workspace_id
from product.backend.db.session import get_db
from product.backend.services.job_service import JobService
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api", tags=["jobs"])


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    investigation_id: str = ""
    mode: str = "combined"
    investigation_group_id: str | None = None
    investigations: list[dict] = Field(default_factory=list)
    files_processed: int = 0
    files_skipped: int = 0
    warnings: list[str] = Field(default_factory=list)
    skipped: list[dict] = Field(default_factory=list)
    error: str = ""
    error_kind: str = ""


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
def get_job_status(
    job_id: str,
    db: Session = Depends(get_db),
    workspace_id: str = Depends(resolve_workspace_id),
) -> JobStatusResponse:
    job = JobService(db).get_job(job_id, workspace_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    payload = JobService(db).to_analyze_response(job)
    return JobStatusResponse(**payload)
