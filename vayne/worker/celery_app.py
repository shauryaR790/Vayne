"""Celery worker scaffold for async investigations."""

from celery import Celery

celery_app = Celery(
    "vayne",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0",
)

celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]
