"""Shared product backend config."""

from __future__ import annotations

import os
from pathlib import Path


def get_storage_root() -> Path:
    return Path(os.getenv("VAYNE_STORAGE", "product/storage/investigations"))
