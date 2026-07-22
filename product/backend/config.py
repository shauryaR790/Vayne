"""Shared product backend config."""

from __future__ import annotations

import os
from pathlib import Path


def get_storage_root() -> Path:
    return Path(os.getenv("VAYNE_STORAGE", "product/storage/investigations"))


def is_production() -> bool:
    env = os.getenv("VAYNE_ENV", os.getenv("ENV", "development")).strip().lower()
    return env in {"production", "prod"}


def expose_error_details() -> bool:
    flag = os.getenv("VAYNE_EXPOSE_ERROR_DETAILS", "").strip().lower()
    if flag in {"0", "false", "no"}:
        return False
    if flag in {"1", "true", "yes"}:
        return True
    return not is_production()


def upload_limits() -> dict[str, int]:
    return {
        "max_files": int(os.getenv("VAYNE_MAX_UPLOAD_FILES", "50")),
        "max_file_bytes": int(os.getenv("VAYNE_MAX_UPLOAD_BYTES", str(50 * 1024 * 1024))),
        "max_total_bytes": int(
            os.getenv("VAYNE_MAX_TOTAL_UPLOAD_BYTES", str(200 * 1024 * 1024))
        ),
    }
