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
from product.backend.schemas.investigation import AnalyzeResponse
from product.backend.services.investigation_service import InvestigationService

router = APIRouter(prefix="/api", tags=["analyze"])

ALLOWED_SUFFIXES = {".xml", ".json", ".txt", ".csv", ".nessus"}


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_upload(
    files: list[UploadFile] = File(...),
    name: str = Form(default="web-investigation"),
    db: Session = Depends(get_db),
) -> AnalyzeResponse:
    tmp = Path(tempfile.mkdtemp(prefix="vayne_upload_"))
    saved: list[Path] = []
    try:
        for uf in files:
            suffix = Path(uf.filename or "").suffix.lower()
            if suffix not in ALLOWED_SUFFIXES:
                continue
            dest = tmp / f"{uuid.uuid4().hex}{suffix}"
            with dest.open("wb") as f:
                shutil.copyfileobj(uf.file, f)
            saved.append(dest)

        if not saved:
            raise HTTPException(
                status_code=400,
                detail="No valid scan files uploaded (xml, json, txt, csv, nessus)",
            )

        svc = InvestigationService(db, get_storage_root())
        source_filename = ",".join(
            sorted(
                uf.filename
                for uf in files
                if uf.filename and Path(uf.filename).suffix.lower() in ALLOWED_SUFFIXES
            )
        )
        inv = svc.run_analysis(name, saved, proof=True, source_filename=source_filename or name)
        return AnalyzeResponse(investigation_id=inv.id, status=inv.status)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
