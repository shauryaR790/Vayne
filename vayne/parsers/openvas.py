"""OpenVAS / GVM XML report parser."""

from __future__ import annotations

import uuid
import xml.etree.ElementTree as ET
from pathlib import Path

from vayne.models.schemas import RawFinding


def parse_openvas_xml(path: Path) -> list[RawFinding]:
    tree = ET.parse(path)
    root = tree.getroot()
    findings: list[RawFinding] = []

    for result in root.findall(".//result"):
        host = _text(result, "host") or _text(result, "ip")
        port = _text(result, "port")
        nvt = result.find("nvt")
        name = _text(nvt, "name") if nvt is not None else _text(result, "name")
        severity = _text(result, "severity") or _text(nvt, "cvss_base") or "info"
        description = _text(result, "description") or _text(nvt, "tags")

        findings.append(
            RawFinding(
                id=str(uuid.uuid4())[:12],
                tool="openvas",
                host=host,
                port=port,
                service=_text(result, "name"),
                version="",
                finding=name or "openvas-finding",
                severity=_severity_from_score(severity),
                evidence=description[:500] if description else "",
            )
        )
    return findings


def _text(parent: ET.Element | None, tag: str) -> str:
    if parent is None:
        return ""
    el = parent.find(tag)
    return (el.text or "").strip() if el is not None else ""


def _severity_from_score(score: str) -> str:
    try:
        val = float(score)
    except ValueError:
        return score.lower() if score else "info"
    if val >= 9.0:
        return "critical"
    if val >= 7.0:
        return "high"
    if val >= 4.0:
        return "medium"
    if val > 0:
        return "low"
    return "info"
