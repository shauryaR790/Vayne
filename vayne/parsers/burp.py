"""Burp Suite XML export parser."""

from __future__ import annotations

import uuid
import xml.etree.ElementTree as ET
from pathlib import Path

from vayne.models.schemas import RawFinding


def parse_burp_xml(path: Path) -> list[RawFinding]:
    tree = ET.parse(path)
    root = tree.getroot()
    findings: list[RawFinding] = []

    for issue in root.findall(".//issue"):
        host = _text(issue, "host")
        port = _text(issue, "port")
        name = _text(issue, "name") or _text(issue, "type")
        severity = (_text(issue, "severity") or "info").lower()
        detail = _text(issue, "issueDetail") or _text(issue, "issueBackground")

        findings.append(
            RawFinding(
                id=str(uuid.uuid4())[:12],
                tool="burp",
                host=host,
                port=port,
                service=_text(issue, "service"),
                version="",
                finding=name,
                severity=severity,
                evidence=detail[:500] if detail else "",
            )
        )
    return findings


def _text(parent: ET.Element, tag: str) -> str:
    el = parent.find(tag)
    return (el.text or "").strip() if el is not None else ""
