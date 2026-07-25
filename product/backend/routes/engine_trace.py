"""Engine Trace — live structured telemetry from the investigation engine."""

from __future__ import annotations

import asyncio
import json
import queue
import shutil
import tempfile
import threading
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from product.backend.auth import resolve_workspace_id
from product.backend.config import upload_limits
from product.backend.db.session import get_db
from product.backend.deps import get_investigation_service
from product.backend.logging_config import get_logger
from product.backend.schemas.investigation import AnalyzeInvestigationItem, AnalyzeResponse, SkippedFile
from product.backend.services.investigation_service import InvestigationService
from product.backend.services.upload_pipeline import preflight_parse
from vayne.engine_trace.events import EngineEvent

router = APIRouter(prefix="/api", tags=["engine-trace"])
logger = get_logger()

ALLOWED_SUFFIXES = {".xml", ".json", ".txt", ".csv", ".nessus"}

_SSE_HEADERS = {
    "Cache-Control": "no-cache, no-store",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.get("/investigation/{inv_id}/engine-trace")
def get_engine_trace(
    inv_id: str,
    svc: InvestigationService = Depends(get_investigation_service),
):
    if not svc.get_investigation(inv_id):
        raise HTTPException(status_code=404, detail="Investigation not found")
    export_dir = svc.export_dir(inv_id)
    json_path = export_dir / "engine_trace.json"
    jsonl_path = export_dir / "engine_trace.jsonl"
    if json_path.exists():
        try:
            return json.loads(json_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=500, detail="Corrupt engine trace") from exc
    if jsonl_path.exists():
        events = []
        for line in jsonl_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return events
    return []


@router.post("/analyze/stream")
async def analyze_stream(
    files: list[UploadFile] = File(...),
    name: str = Form(default="web-investigation"),
    prompt: str = Form(default=""),
    mode: str = Form(default=""),
    svc: InvestigationService = Depends(get_investigation_service),
    db: Session = Depends(get_db),
    workspace_id: str = Depends(resolve_workspace_id),
):
    """Run analysis and stream real Engine Trace events as SSE."""
    _ = db, workspace_id
    limits = upload_limits()
    if len(files) > limits["max_files"]:
        raise HTTPException(status_code=413, detail=f"Too many files (max {limits['max_files']})")

    tmp = Path(tempfile.mkdtemp(prefix="vayne_trace_"))
    uploads: list[tuple[Path, str]] = []
    try:
        for uf in files:
            original = uf.filename or ""
            suffix = Path(original).suffix.lower()
            if suffix not in ALLOWED_SUFFIXES:
                continue
            dest = tmp / f"{len(uploads)}_{Path(original).name}"
            data = await uf.read()
            dest.write_bytes(data)
            uploads.append((dest, original))

        if not uploads:
            raise HTTPException(status_code=422, detail="No supported scan files uploaded")

        preflight = preflight_parse(uploads)
        if not preflight.has_any_success:
            first = preflight.failed[0]
            raise HTTPException(
                status_code=preflight.worst_status_code(),
                detail=first.error or "Parse failed",
            )

        good_uploads = [
            (path, original)
            for (path, original), outcome in zip(uploads, preflight.outcomes)
            if outcome.ok
        ]

        event_q: queue.Queue = queue.Queue()

        def on_event(event: EngineEvent) -> None:
            event_q.put({"type": "engine_event", "event": event.to_dict()})

        def worker() -> None:
            try:
                t0 = time.perf_counter()
                batch = svc.run_analysis_batch(
                    name,
                    good_uploads,
                    prompt=prompt or None,
                    explicit_mode=mode or None,
                    proof=True,
                    on_event=on_event,
                )
                skipped = [
                    {
                        "file": o.filename,
                        "stage": o.stage,
                        "error": o.error or "",
                        "error_kind": o.error_kind or "",
                    }
                    for o in preflight.failed
                ]
                response = AnalyzeResponse(
                    investigation_id=batch.primary.id,
                    status="complete" if not skipped else "complete_with_warnings",
                    mode=batch.mode,  # type: ignore[arg-type]
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
                    skipped=[SkippedFile(**row) for row in skipped],
                )
                event_q.put(
                    {
                        "type": "complete",
                        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 3),
                        "result": response.model_dump(),
                    }
                )
            except Exception as exc:
                logger.exception("analyze stream failed")
                event_q.put({"type": "error", "message": str(exc)[:300]})
            finally:
                event_q.put(None)
                shutil.rmtree(tmp, ignore_errors=True)

        threading.Thread(target=worker, daemon=True).start()

        async def gen():
            yield _sse(
                {
                    "type": "engine_event",
                    "event": {
                        "stage": "parser",
                        "event": "intake",
                        "message": "Upload accepted — starting deterministic engine",
                        "fields": {
                            "files": [name for _, name in good_uploads],
                            "files_processed": len(good_uploads),
                        },
                    },
                }
            )
            while True:
                try:
                    item = await asyncio.to_thread(event_q.get, True, 0.25)
                except queue.Empty:
                    yield ": keepalive\n\n"
                    continue
                if item is None:
                    break
                yield _sse(item)

        return StreamingResponse(gen(), media_type="text/event-stream", headers=_SSE_HEADERS)
    except HTTPException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
