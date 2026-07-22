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

from product.backend.config import async_analyze_enabled, expose_error_details, public_error_message, upload_limits
from product.backend.db.session import get_db
from product.backend.deps import get_investigation_service
from product.backend.auth import resolve_workspace_id
from product.backend.logging_config import get_logger
from product.backend.schemas.investigation import (
    AnalyzeInvestigationItem,
    AnalyzeResponse,
    SkippedFile,
)
from product.backend.services.investigation_service import InvestigationService
from product.backend.services.job_service import JobService
from product.backend.services.upload_pipeline import preflight_parse

router = APIRouter(prefix="/api", tags=["analyze"])

logger = get_logger()

ALLOWED_SUFFIXES = {".xml", ".json", ".txt", ".csv", ".nessus"}


def _error_response(status_code: int, payload: dict) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=payload)


def _sanitize_error_payload(payload: dict) -> dict:
    if expose_error_details():
        return payload
    sanitized = dict(payload)
    sanitized.pop("details", None)
    return sanitized


@router.post("/analyze")
async def analyze_upload(
    files: list[UploadFile] = File(...),
    name: str = Form(default="web-investigation"),
    prompt: str = Form(default=""),
    mode: str = Form(default=""),
    svc: InvestigationService = Depends(get_investigation_service),
    db: Session = Depends(get_db),
    workspace_id: str = Depends(resolve_workspace_id),
):
    limits = upload_limits()
    if len(files) > limits["max_files"]:
        return _error_response(
            413,
            _sanitize_error_payload(
                {
                    "success": False,
                    "stage": "intake",
                    "error": f"Too many files (max {limits['max_files']})",
                    "error_kind": "upload_limit",
                    "files_processed": 0,
                    "files_skipped": len(files),
                }
            ),
        )

    request_started = time.perf_counter()
    tmp = Path(tempfile.mkdtemp(prefix="vayne_upload_"))
    uploads: list[tuple[Path, str]] = []
    unsupported: list[str] = []
    total_bytes = 0
    try:
        for uf in files:
            original = uf.filename or ""
            suffix = Path(original).suffix.lower()
            if suffix not in ALLOWED_SUFFIXES:
                unsupported.append(original or "(unnamed)")
                continue

            chunks: list[bytes] = []
            file_bytes = 0
            while True:
                chunk = await uf.read(1024 * 1024)
                if not chunk:
                    break
                file_bytes += len(chunk)
                total_bytes += len(chunk)
                if file_bytes > limits["max_file_bytes"]:
                    return _error_response(
                        413,
                        _sanitize_error_payload(
                            {
                                "success": False,
                                "stage": "intake",
                                "file": original,
                                "error": (
                                    f"File exceeds size limit "
                                    f"({limits['max_file_bytes'] // (1024 * 1024)} MB)"
                                ),
                                "error_kind": "upload_limit",
                                "files_processed": 0,
                                "files_skipped": 1,
                            }
                        ),
                    )
                if total_bytes > limits["max_total_bytes"]:
                    return _error_response(
                        413,
                        _sanitize_error_payload(
                            {
                                "success": False,
                                "stage": "intake",
                                "error": (
                                    f"Upload exceeds total size limit "
                                    f"({limits['max_total_bytes'] // (1024 * 1024)} MB)"
                                ),
                                "error_kind": "upload_limit",
                                "files_processed": 0,
                                "files_skipped": len(files),
                            }
                        ),
                    )
                chunks.append(chunk)

            dest = tmp / f"{uuid.uuid4().hex}{suffix}"
            with dest.open("wb") as f:
                for chunk in chunks:
                    f.write(chunk)
            uploads.append((dest, original))

        if not uploads:
            logger.error(
                "No supported files in upload (received: %s)",
                ", ".join(unsupported) or "none",
            )
            return _error_response(
                422,
                _sanitize_error_payload(
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
                    }
                ),
            )

        preflight = preflight_parse(uploads)

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
            return _error_response(status, _sanitize_error_payload(payload))

        good_uploads = [
            (path, original)
            for (path, original), outcome in zip(uploads, preflight.outcomes)
            if outcome.ok
        ]

        skipped = [
            SkippedFile(
                file=o.filename,
                stage=o.stage,
                error=o.error or "",
                error_kind=o.error_kind or "",
            )
            for o in preflight.failed
        ]

        if async_analyze_enabled():
            job_svc = JobService(db)
            job = job_svc.create_job(
                workspace_id=workspace_id,
                name=name,
                prompt=prompt,
                mode_hint=mode,
                uploads=good_uploads,
                preflight_failed=preflight.failed,
            )
            from vayne.worker.tasks import enqueue_analysis_job

            enqueue_analysis_job(job.id)
            logger.info("Queued async analysis job %s", job.id)
            return AnalyzeResponse(
                job_id=job.id,
                investigation_id="",
                status="queued",
                mode=mode or "combined",
                investigations=[],
                files_processed=len(preflight.succeeded),
                files_skipped=len(preflight.failed),
                warnings=preflight.warnings(),
                skipped=skipped,
            )

        try:
            batch = svc.run_analysis_batch(
                name,
                good_uploads,
                prompt=prompt or None,
                explicit_mode=mode or None,
                proof=True,
            )
        except Exception as exc:
            tb = traceback.format_exc()
            logger.error("Engine stage failed:\n%s", tb)
            payload = {
                "success": False,
                "stage": "engine",
                "file": ", ".join(o.filename for o in preflight.succeeded),
                "error": public_error_message() if not expose_error_details() else f"Investigation engine failed: {exc}",
                "error_kind": "internal_error",
                "files_processed": len(preflight.succeeded),
                "files_skipped": len(preflight.failed),
                "warnings": preflight.warnings(),
            }
            if expose_error_details():
                payload["details"] = tb
            return _error_response(500, payload)

        primary = batch.primary
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
