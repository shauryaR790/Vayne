"""Upload + analyze endpoint.

Every uploaded file is parsed one-by-one in a pre-flight stage so a single
malformed file can never crash the request or be misreported as "backend
unreachable". Failures are classified and returned as structured JSON with
precise HTTP status codes; successful files continue through the engine.
"""

from __future__ import annotations

import shutil
import tempfile
import time
import traceback
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from product.backend.config import get_storage_root
from product.backend.db.session import get_db
from product.backend.logging_config import get_logger
from product.backend.schemas.investigation import (
    AnalyzeInvestigationItem,
    AnalyzeResponse,
    SkippedFile,
)
from product.backend.services.investigation_service import InvestigationService
from product.backend.services.upload_pipeline import preflight_parse

router = APIRouter(prefix="/api", tags=["analyze"])

logger = get_logger()

ALLOWED_SUFFIXES = {".xml", ".json", ".txt", ".csv", ".nessus"}


def _error_response(status_code: int, payload: dict) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=payload)


@router.post("/analyze")
async def analyze_upload(
    files: list[UploadFile] = File(...),
    name: str = Form(default="web-investigation"),
    prompt: str = Form(default=""),
    mode: str = Form(default=""),
    db: Session = Depends(get_db),
):
    request_started = time.perf_counter()
    tmp = Path(tempfile.mkdtemp(prefix="vayne_upload_"))
    uploads: list[tuple[Path, str]] = []
    unsupported: list[str] = []
    try:
        for uf in files:
            original = uf.filename or ""
            suffix = Path(original).suffix.lower()
            if suffix not in ALLOWED_SUFFIXES:
                unsupported.append(original or "(unnamed)")
                continue
            dest = tmp / f"{uuid.uuid4().hex}{suffix}"
            with dest.open("wb") as f:
                shutil.copyfileobj(uf.file, f)
            uploads.append((dest, original))

        if not uploads:
            logger.error(
                "No supported files in upload (received: %s)",
                ", ".join(unsupported) or "none",
            )
            return _error_response(
                422,
                {
                    "success": False,
                    "stage": "intake",
                    "file": ", ".join(unsupported),
                    "error": "Unsupported file format",
                    "error_kind": "unsupported_file",
                    "details": (
                        "No valid scan files uploaded. Accepted: "
                        ".xml, .json, .txt, .csv, .nessus"
                    ),
                    "files_processed": 0,
                    "files_skipped": len(unsupported),
                    "warnings": [f"{n}: unsupported file type" for n in unsupported],
                },
            )

        # Stage 1: pre-flight parse each file individually.
        preflight = preflight_parse(uploads)

        # Every file failed — surface the first real failure with a stack trace.
        if not preflight.has_any_success:
            first = preflight.failed[0]
            status = preflight.worst_status_code()
            payload = first.as_error_payload()
            payload.update(
                {
                    "files_processed": 0,
                    "files_skipped": len(preflight.failed),
                    "warnings": preflight.warnings(),
                }
            )
            logger.error(
                "Investigation aborted: all %d file(s) failed to parse "
                "(returning HTTP %d)",
                len(preflight.failed),
                status,
            )
            return _error_response(status, payload)

        # Stage 2: run the engine on the files that parsed cleanly.
        good_uploads = [
            (path, original)
            for (path, original), outcome in zip(uploads, preflight.outcomes)
            if outcome.ok
        ]

        svc = InvestigationService(db, get_storage_root())
        try:
            batch = svc.run_analysis_batch(
                name,
                good_uploads,
                prompt=prompt or None,
                explicit_mode=mode or None,
                proof=True,
            )
        except Exception as exc:  # engine/correlation/graph/report failure
            tb = traceback.format_exc()
            logger.error("Engine stage failed:\n%s", tb)
            return _error_response(
                500,
                {
                    "success": False,
                    "stage": "engine",
                    "file": ", ".join(o.filename for o in preflight.succeeded),
                    "error": f"Investigation engine failed: {exc}",
                    "error_kind": "internal_error",
                    "details": tb,
                    "files_processed": len(preflight.succeeded),
                    "files_skipped": len(preflight.failed),
                    "warnings": preflight.warnings(),
                },
            )

        primary = batch.primary
        skipped = [
            SkippedFile(
                file=o.filename,
                stage=o.stage,
                error=o.error or "",
                error_kind=o.error_kind or "",
            )
            for o in preflight.failed
        ]
        status = "complete_with_warnings" if preflight.failed else primary.status

        logger.info(
            "Response ready \u2014 %d processed, %d skipped, total %.0f ms",
            len(preflight.succeeded),
            len(preflight.failed),
            (time.perf_counter() - request_started) * 1000,
        )

        response = AnalyzeResponse(
            investigation_id=primary.id,
            status=status,
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
            files_processed=len(preflight.succeeded),
            files_skipped=len(preflight.failed),
            warnings=preflight.warnings(),
            skipped=skipped,
        )
        return response
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
