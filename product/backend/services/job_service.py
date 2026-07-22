"""Analysis job queue service."""

from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from product.backend.config import get_storage_root
from product.backend.models.job import AnalysisJobORM
from product.backend.services.investigation_service import InvestigationService
from product.backend.services.upload_pipeline import FileParseOutcome

TERMINAL_STATUSES = {"complete", "complete_with_warnings", "failed"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class JobService:
    def __init__(self, db: Session, storage_root: Path | None = None):
        self.db = db
        self.storage_root = storage_root or get_storage_root()
        self.staging_root = self.storage_root / "job_staging"
        self.staging_root.mkdir(parents=True, exist_ok=True)

    def create_job(
        self,
        *,
        workspace_id: str,
        name: str,
        prompt: str,
        mode_hint: str,
        uploads: list[tuple[Path, str]],
        preflight_failed: list[FileParseOutcome],
    ) -> AnalysisJobORM:
        job_id = str(uuid.uuid4())
        staging_dir = self.staging_root / job_id
        staging_dir.mkdir(parents=True, exist_ok=True)

        manifest: list[dict[str, str]] = []
        for src, original in uploads:
            dest = staging_dir / f"{uuid.uuid4().hex}{src.suffix}"
            shutil.copy2(src, dest)
            manifest.append({"path": dest.name, "original": original})

        (staging_dir / "manifest.json").write_text(
            json.dumps({"files": manifest}),
            encoding="utf-8",
        )

        job = AnalysisJobORM(
            id=job_id,
            workspace_id=workspace_id,
            status="queued",
            name=name,
            prompt=prompt or "",
            mode_hint=mode_hint or "",
            staging_dir=str(staging_dir),
            files_processed=len(uploads),
            files_skipped=len(preflight_failed),
            warnings_json=json.dumps(
                [f"{o.filename}: {o.error}" for o in preflight_failed if o.error]
            ),
            skipped_json=json.dumps(
                [
                    {
                        "file": o.filename,
                        "stage": o.stage,
                        "error": o.error or "",
                        "error_kind": o.error_kind or "",
                    }
                    for o in preflight_failed
                ]
            ),
            created_at=_utcnow(),
            updated_at=_utcnow(),
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def get_job(self, job_id: str, workspace_id: str) -> AnalysisJobORM | None:
        return (
            self.db.query(AnalysisJobORM)
            .filter(
                AnalysisJobORM.id == job_id,
                AnalysisJobORM.workspace_id == workspace_id,
            )
            .first()
        )

    def get_job_any_workspace(self, job_id: str) -> AnalysisJobORM | None:
        return self.db.get(AnalysisJobORM, job_id)

    def mark_running(self, job: AnalysisJobORM) -> None:
        job.status = "running"
        job.updated_at = _utcnow()
        self.db.commit()

    def mark_failed(self, job: AnalysisJobORM, *, error: str, error_kind: str = "internal_error") -> None:
        job.status = "failed"
        job.error = error
        job.error_kind = error_kind
        job.updated_at = _utcnow()
        job.completed_at = _utcnow()
        self.db.commit()
        self._cleanup_staging(job)

    def mark_complete(
        self,
        job: AnalysisJobORM,
        *,
        batch,
        status: str,
        warnings: list[str],
    ) -> None:
        investigations = [
            {
                "investigation_id": inv.id,
                "source_filename": inv.source_filename or "",
                "status": inv.status,
            }
            for inv in batch.investigations
        ]
        job.status = status
        job.resolved_mode = batch.mode
        job.investigation_group_id = batch.investigation_group_id
        job.primary_investigation_id = batch.primary.id
        job.result_json = json.dumps({"investigations": investigations})
        job.warnings_json = json.dumps(warnings)
        job.updated_at = _utcnow()
        job.completed_at = _utcnow()
        self.db.commit()
        self._cleanup_staging(job)

    def execute_job(self, job_id: str) -> None:
        job = self.get_job_any_workspace(job_id)
        if not job:
            return
        if job.status in TERMINAL_STATUSES:
            return

        self.mark_running(job)
        svc = InvestigationService(self.db, self.storage_root, workspace_id=job.workspace_id)

        try:
            staging = Path(job.staging_dir)
            manifest = json.loads((staging / "manifest.json").read_text(encoding="utf-8"))
            uploads = [
                (staging / item["path"], item["original"])
                for item in manifest.get("files", [])
            ]
            batch = svc.run_analysis_batch(
                job.name,
                uploads,
                prompt=job.prompt or None,
                explicit_mode=job.mode_hint or None,
                proof=True,
            )
            for inv in batch.investigations:
                svc.write_workbench_cache(inv.id)

            warnings = json.loads(job.warnings_json or "[]")
            status = "complete_with_warnings" if job.files_skipped else batch.primary.status
            self.mark_complete(job, batch=batch, status=status, warnings=warnings)
        except Exception as exc:
            self.mark_failed(job, error=str(exc))

    def _cleanup_staging(self, job: AnalysisJobORM) -> None:
        if job.staging_dir:
            shutil.rmtree(job.staging_dir, ignore_errors=True)

    def to_analyze_response(self, job: AnalysisJobORM) -> dict:
        investigations = []
        result = json.loads(job.result_json or "{}")
        for item in result.get("investigations") or []:
            investigations.append(item)

        skipped = json.loads(job.skipped_json or "[]")
        warnings = json.loads(job.warnings_json or "[]")

        return {
            "job_id": job.id,
            "investigation_id": job.primary_investigation_id or "",
            "status": job.status,
            "mode": job.resolved_mode or "combined",
            "investigation_group_id": job.investigation_group_id,
            "investigations": investigations,
            "files_processed": job.files_processed,
            "files_skipped": job.files_skipped,
            "warnings": warnings,
            "skipped": skipped,
            "error": job.error,
            "error_kind": job.error_kind,
        }
