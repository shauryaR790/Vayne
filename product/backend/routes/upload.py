"""Upload + analyze endpoint."""

from __future__ import annotations

import shutil
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from product.backend.config import get_storage_root
from product.backend.db.session import get_db
from product.backend.schemas.investigation import AnalyzeInvestigationItem, AnalyzeResponse
from product.backend.services.investigation_service import InvestigationService

router = APIRouter(prefix="/api", tags=["analyze"])

ALLOWED_SUFFIXES = {".xml", ".json", ".txt", ".csv", ".nessus"}


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_upload(
    files: list[UploadFile] = File(...),
    name: str = Form(default="web-investigation"),
    prompt: str = Form(default=""),
    mode: str = Form(default=""),
    db: Session = Depends(get_db),
) -> AnalyzeResponse:
    tmp = Path(tempfile.mkdtemp(prefix="vayne_upload_"))
    uploads: list[tuple[Path, str]] = []
    try:
        for uf in files:
            original = uf.filename or ""
            suffix = Path(original).suffix.lower()
            if suffix not in ALLOWED_SUFFIXES:
                continue
            dest = tmp / f"{uuid.uuid4().hex}{suffix}"
            with dest.open("wb") as f:
                shutil.copyfileobj(uf.file, f)
            uploads.append((dest, original))

        if not uploads:
            raise HTTPException(
                status_code=400,
                detail="No valid scan files uploaded (xml, json, txt, csv, nessus)",
            )

        svc = InvestigationService(db, get_storage_root())
        batch = svc.run_analysis_batch(
            name,
            uploads,
            prompt=prompt or None,
            explicit_mode=mode or None,
            proof=True,
        )
        primary = batch.primary
        return AnalyzeResponse(
            investigation_id=primary.id,
            status=primary.status,
            mode=batch.mode,
            investigation_group_id=batch.investigation_group_id,
            investigations=[
                AnalyzeInvestigationItem(
                    investigation_id=inv.id,
                    source_filename=inv.source_filename or "",
                    status=inv.status,
                )
                for inv in batch.investigations
            ],
        )
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
