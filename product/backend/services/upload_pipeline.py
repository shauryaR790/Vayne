"""Upload pre-flight pipeline.

Parses every uploaded evidence file *individually* before it reaches the
VAYNE engine so that:

* one malformed file can never crash the whole request,
* every parser runs inside try/except with timing + memory + stack traces,
* failures are classified into precise categories that map to HTTP codes.

This module calls into the VAYNE engine's parser loader but never modifies
engine internals — it is a product-side guard rail around them.
"""

from __future__ import annotations

import json
import time
import tracemalloc
import traceback
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

from product.backend.config import expose_error_details
from product.backend.logging_config import get_logger
from vayne.parsers.loader import parse_file as engine_parse_file

logger = get_logger()

# Error kinds -> HTTP status codes.
KIND_UNSUPPORTED = "unsupported_file"
KIND_INVALID_XML = "invalid_xml"
KIND_INVALID_JSON = "invalid_json"
KIND_PARSER_ERROR = "parser_error"

_STATUS_BY_KIND = {
    KIND_UNSUPPORTED: 422,
    KIND_INVALID_XML: 422,
    KIND_INVALID_JSON: 422,
    KIND_PARSER_ERROR: 500,
}

_MESSAGE_BY_KIND = {
    KIND_UNSUPPORTED: "Unsupported file format",
    KIND_INVALID_XML: "XML parsing failed",
    KIND_INVALID_JSON: "JSON parsing failed",
    KIND_PARSER_ERROR: "Parser raised an exception",
}


@dataclass
class FileParseOutcome:
    """Result of attempting to parse a single uploaded file."""

    filename: str
    parser: str
    ok: bool
    duration_ms: float
    findings: int = 0
    assets: int = 0
    peak_kb: float | None = None
    stage: str = ""
    error_kind: str | None = None
    error: str | None = None
    details: str | None = None
    status_code: int | None = None

    def as_error_payload(self) -> dict:
        payload = {
            "success": False,
            "stage": self.stage,
            "file": self.filename,
            "error": self.error,
            "error_kind": self.error_kind,
        }
        if expose_error_details() and self.details:
            payload["details"] = self.details
        return payload


@dataclass
class PreflightResult:
    outcomes: list[FileParseOutcome] = field(default_factory=list)

    @property
    def succeeded(self) -> list[FileParseOutcome]:
        return [o for o in self.outcomes if o.ok]

    @property
    def failed(self) -> list[FileParseOutcome]:
        return [o for o in self.outcomes if not o.ok]

    @property
    def has_any_success(self) -> bool:
        return any(o.ok for o in self.outcomes)

    def warnings(self) -> list[str]:
        return [
            f"{o.filename}: {o.error}"
            for o in self.failed
        ]

    def worst_status_code(self) -> int:
        """500 if any real parser/internal error, else 422 for bad formats."""
        codes = [o.status_code or 500 for o in self.failed]
        return 500 if any(c >= 500 for c in codes) else 422


def guess_parser_name(path: Path) -> str:
    """Human label for which parser will handle a file (for logging only)."""
    name = path.name.lower()
    for hint in ("nuclei", "nmap", "burp", "nessus", "openvas", "httpx", "naabu", "katana"):
        if hint in name:
            return f"{hint}_parser"
    suffix = path.suffix.lower()
    if suffix == ".json":
        return "json_auto_parser"
    if suffix == ".xml":
        return "xml_auto_parser"
    if suffix == ".csv":
        return "csv_parser"
    return "unknown_parser"


def _classify(exc: Exception, path: Path) -> tuple[str, str]:
    """Map a parser exception to (error_kind, human_message)."""
    if isinstance(exc, ET.ParseError):
        return KIND_INVALID_XML, _MESSAGE_BY_KIND[KIND_INVALID_XML]
    if isinstance(exc, json.JSONDecodeError):
        return KIND_INVALID_JSON, _MESSAGE_BY_KIND[KIND_INVALID_JSON]

    message = str(exc).lower()
    unsupported_markers = (
        "cannot determine parser",
        "unsupported file",
        "unknown json scan format",
        "unknown xml scan format",
    )
    if isinstance(exc, ValueError) and any(m in message for m in unsupported_markers):
        return KIND_UNSUPPORTED, _MESSAGE_BY_KIND[KIND_UNSUPPORTED]

    return KIND_PARSER_ERROR, _MESSAGE_BY_KIND[KIND_PARSER_ERROR]


def parse_single_file(path: Path, original_name: str) -> FileParseOutcome:
    """Parse one file with full instrumentation. Never raises."""
    parser = guess_parser_name(path)
    stage = parser
    if path.stat().st_size == 0:
        return FileParseOutcome(
            filename=original_name,
            parser=parser,
            ok=False,
            duration_ms=0.0,
            stage=stage,
            error_kind=KIND_INVALID_JSON,
            error="Empty file",
            details="The uploaded file contains no data.",
            status_code=422,
        )
    tracemalloc.start()
    started = time.perf_counter()
    try:
        findings, assets = engine_parse_file(path)
        duration_ms = (time.perf_counter() - started) * 1000
        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        peak_kb = round(peak / 1024, 1)

        outcome = FileParseOutcome(
            filename=original_name,
            parser=parser,
            ok=True,
            duration_ms=round(duration_ms, 1),
            findings=len(findings),
            assets=len(assets),
            peak_kb=peak_kb,
            stage=stage,
        )
        logger.info(
            "\u2713 %s parsed  (%s, %d findings, %d assets, %.1f ms, peak %.1f KB)",
            original_name,
            parser,
            outcome.findings,
            outcome.assets,
            outcome.duration_ms,
            peak_kb,
        )
        return outcome
    except Exception as exc:  # noqa: BLE001 - deliberate: never let one file crash the request
        duration_ms = (time.perf_counter() - started) * 1000
        try:
            _, peak = tracemalloc.get_traced_memory()
            peak_kb = round(peak / 1024, 1)
        finally:
            tracemalloc.stop()

        kind, message = _classify(exc, path)
        tb = traceback.format_exc()
        safe_error = f"{message}." if not expose_error_details() else f"{message}: {exc}"
        outcome = FileParseOutcome(
            filename=original_name,
            parser=parser,
            ok=False,
            duration_ms=round(duration_ms, 1),
            peak_kb=peak_kb,
            stage=stage,
            error_kind=kind,
            error=safe_error,
            details=tb if expose_error_details() else None,
            status_code=_STATUS_BY_KIND.get(kind, 500),
        )
        logger.error(
            "\u2717 %s failed  (%s, %s) after %.1f ms\n%s",
            original_name,
            parser,
            kind,
            outcome.duration_ms,
            tb,
        )
        return outcome


def preflight_parse(uploads: list[tuple[Path, str]]) -> PreflightResult:
    """Parse every uploaded file sequentially so failures are deterministic."""
    logger.info("Upload received \u2014 %d file(s) queued for parsing", len(uploads))
    result = PreflightResult()
    for path, original_name in uploads:
        result.outcomes.append(parse_single_file(path, original_name))

    processed = len(result.succeeded)
    skipped = len(result.failed)
    logger.info(
        "Parsing complete \u2014 %d processed, %d skipped", processed, skipped
    )
    if skipped and not processed:
        logger.error("All files failed to parse. Stopping investigation.")
    elif skipped:
        for warning in result.warnings():
            logger.warning("Skipped %s", warning)
    return result
