"""Central logging setup for the VAYNE product API.

Gives the upload pipeline a dedicated, human-readable logger that always
writes to the terminal. Never swallow exceptions — every stage logs and
re-raises so the real failure is visible instead of being hidden behind a
generic "Cannot reach API" message on the frontend.
"""

from __future__ import annotations

import logging
import os
import sys

LOGGER_NAME = "vayne.product"

_CONFIGURED = False


def configure_logging() -> logging.Logger:
    """Idempotently configure the product logger with a console handler."""
    global _CONFIGURED
    logger = logging.getLogger(LOGGER_NAME)

    if _CONFIGURED:
        return logger

    level_name = os.getenv("VAYNE_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    # Windows consoles default to cp1252 and choke on the ✓/✗/↓ glyphs used in
    # the pipeline logs. Reconfigure stdout to UTF-8 (never fatal if it fails).
    stream = sys.stdout
    try:
        stream.reconfigure(encoding="utf-8", errors="backslashreplace")  # type: ignore[union-attr]
    except Exception:  # noqa: BLE001 - best effort only
        pass

    handler = logging.StreamHandler(stream)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s | %(levelname)-7s | vayne.product | %(message)s",
            datefmt="%H:%M:%S",
        )
    )

    logger.setLevel(level)
    logger.handlers = [handler]
    # Do not double-print through the uvicorn root logger.
    logger.propagate = False

    _CONFIGURED = True
    return logger


def get_logger() -> logging.Logger:
    return configure_logging()
