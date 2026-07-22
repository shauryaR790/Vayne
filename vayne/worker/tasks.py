"""Celery tasks for background investigation analysis."""

from __future__ import annotations

from product.backend.env import load_repo_env

load_repo_env()

from vayne.worker.celery_app import celery_app


@celery_app.task(name="vayne.run_analysis_job", bind=True, max_retries=0)
def run_analysis_job(self, job_id: str) -> dict:
    from product.backend.db.session import SessionLocal
    from product.backend.services.job_service import JobService

    db = SessionLocal()
    try:
        JobService(db).execute_job(job_id)
        return {"job_id": job_id, "status": "finished"}
    finally:
        db.close()


def enqueue_analysis_job(job_id: str) -> None:
    run_analysis_job.delay(job_id)
