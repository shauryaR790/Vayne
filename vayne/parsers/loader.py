"""Parse scan files and directories into Finding + Asset lists."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from vayne.models import Asset, Finding
from vayne.parsers import burp, httpx, katana, naabu, nessus, nmap, nuclei, openvas

PARSER_BY_HINT = {
    "nuclei": nuclei.parse,
    "nmap": nmap.parse,
    "burp": burp.parse,
    "nessus": nessus.parse,
    "openvas": openvas.parse,
    "httpx": httpx.parse,
    "naabu": naabu.parse,
    "katana": katana.parse,
}


def _uid() -> str:
    return uuid.uuid4().hex[:12]


SKIP_FILE_NAMES = ("evidence_manifest.json",)


def parse_file(path: Path) -> tuple[list[Finding], list[Asset]]:
    if path.name.lower() in SKIP_FILE_NAMES:
        return [], []
    name = path.name.lower()
    parser = _resolve_parser(path, name)
    return parser(path)


def _resolve_parser(path: Path, name: str):
    for hint, fn in PARSER_BY_HINT.items():
        if hint in name:
            return fn
    suffix = path.suffix.lower()
    if suffix == ".json":
        return lambda p: _auto_json(p)
    if suffix == ".xml":
        return lambda p: _auto_xml(p)
    raise ValueError(f"Cannot determine parser for: {path}")


def _auto_json(path: Path) -> tuple[list[Finding], list[Asset]]:
    data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    if isinstance(data, list) and data:
        sample = data[0]
        if "template-id" in sample or "templateID" in sample:
            return nuclei.parse(path)
        if "url" in sample and ("status-code" in sample or "status_code" in sample):
            return httpx.parse(path)
        if "port" in sample and "ip" in sample:
            return naabu.parse(path)
        if "request" in sample and "endpoint" in sample:
            return katana.parse(path)
    return httpx.parse(path)


def _auto_xml(path: Path) -> tuple[list[Finding], list[Asset]]:
    head = path.read_text(encoding="utf-8", errors="replace")[:800].lower()
    if "nmaprun" in head:
        return nmap.parse(path)
    if "nessusclientdata" in head or "reportitem" in head:
        return nessus.parse(path)
    if "issues" in head:
        return burp.parse(path)
    if "report" in head and ("nvt" in head or "result" in head):
        return openvas.parse(path)
    return nessus.parse(path)


def load_scan_files(paths: list[Path]) -> tuple[list[Finding], list[Asset]]:
    files: list[Path] = []
    for p in paths:
        if p.is_dir():
            for ext in ("*.json", "*.xml"):
                files.extend(sorted(p.rglob(ext)))
        elif p.is_file():
            files.append(p)
        else:
            raise FileNotFoundError(str(p))

    if not files:
        raise ValueError("No scan files found")

    findings: list[Finding] = []
    assets: list[Asset] = []
    for f in files:
        fnds, asts = parse_file(f)
        findings.extend(fnds)
        assets.extend(asts)
    return findings, assets


def load_scan_directory(path: Path) -> tuple[list[Finding], list[Asset]]:
    return load_scan_files([path])
