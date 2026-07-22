"""Celery worker scaffold for async investigations."""

from __future__ import annotations

import os

from celery import Celery

from product.backend.config import redis_url

_broker = redis_url()

celery_app = Celery(
    "vayne",
    broker=_broker,
    backend=_broker,
    include=["vayne.worker.tasks"],
)

celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]
celery_app.conf.task_track_started = True
celery_app.conf.task_time_limit = int(os.getenv("VAYNE_JOB_TIMEOUT_SECONDS", "900"))
