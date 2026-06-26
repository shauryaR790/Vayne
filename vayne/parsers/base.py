"""Base parser utilities and file routing."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from vayne.models.schemas import RawFinding
from vayne.parsers.burp import parse_burp_xml
from vayne.parsers.nessus import parse_nessus_csv
from vayne.parsers.nmap import parse_nmap_xml
from vayne.parsers.nuclei import parse_nuclei_json
from vayne.parsers.openvas import parse_openvas_xml

PARSER_MAP = {
    ".json": "auto_json",
    ".xml": "auto_xml",
    ".csv": "auto_csv",
}


def _new_id() -> str:
    return str(uuid.uuid4())[:12]


def parse_file(path: Path) -> list[RawFinding]:
    suffix = path.suffix.lower()
    name = path.name.lower()

    if suffix == ".json":
        return _parse_json_file(path, name)
    if suffix == ".xml":
        return _parse_xml_file(path, name)
    if suffix == ".csv":
        return _parse_csv_file(path, name)

    raise ValueError(f"Unsupported file type: {path}")


def _parse_json_file(path: Path, name: str) -> list[RawFinding]:
    if "nuclei" in name:
        return parse_nuclei_json(path)
    content = path.read_text(encoding="utf-8", errors="replace")
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON: {path}") from exc
    if isinstance(data, list) and data and "template-id" in data[0]:
        return parse_nuclei_json(path)
    raise ValueError(f"Unknown JSON scan format: {path}")


def _parse_xml_file(path: Path, name: str) -> list[RawFinding]:
    if "nmap" in name:
        return parse_nmap_xml(path)
    if "burp" in name:
        return parse_burp_xml(path)
    if "openvas" in name or "gvm" in name:
        return parse_openvas_xml(path)
  # sniff content
    text = path.read_text(encoding="utf-8", errors="replace")[:500].lower()
    if "nmaprun" in text:
        return parse_nmap_xml(path)
    if "issues" in text or "burp" in text:
        return parse_burp_xml(path)
    if "report" in text and "nvt" in text:
        return parse_openvas_xml(path)
    raise ValueError(f"Unknown XML scan format: {path}")


def _parse_csv_file(path: Path, name: str) -> list[RawFinding]:
    if "nessus" in name:
        return parse_nessus_csv(path)
    return parse_nessus_csv(path)


def load_findings(paths: list[Path]) -> list[RawFinding]:
    """Load and parse findings from files or directories."""
    files: list[Path] = []
    for p in paths:
        if p.is_dir():
            for ext in ("*.json", "*.xml", "*.csv"):
                files.extend(sorted(p.glob(ext)))
        elif p.is_file():
            files.append(p)
        else:
            raise FileNotFoundError(f"Path not found: {p}")

    if not files:
        raise ValueError("No scan files found")

    findings: list[RawFinding] = []
    for f in files:
        findings.extend(parse_file(f))
    return findings
