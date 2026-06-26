"""Burp Suite XML parser."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

from vayne.models import Asset, Finding
from vayne.parsers.common import extract_cve, merge_asset, new_id, now, parse_port


def parse(path: Path) -> tuple[list[Finding], list[Asset]]:
    root = ET.parse(path).getroot()
    findings: list[Finding] = []
    assets: dict[str, Asset] = {}

    for issue in root.findall(".//issue"):
        host = _txt(issue, "host")
        port = parse_port(_txt(issue, "port"))
        name = _txt(issue, "name") or _txt(issue, "type")
        detail = _txt(issue, "issueDetail")
        severity = (_txt(issue, "severity") or "info").lower()
        service = _txt(issue, "service")

        findings.append(
            Finding(
                id=new_id(),
                host=host,
                service=service,
                port=port,
                severity=severity,
                cve=extract_cve(f"{name} {detail}"),
                title=name,
                description=detail[:400],
                evidence=detail[:500],
                confidence=65,
                source_tool="burp",
                timestamp=now(),
            )
        )
        merge_asset(assets, host, port=port, service=service, tag="burp")

    return findings, list(assets.values())


def _txt(parent: ET.Element, tag: str) -> str:
    el = parent.find(tag)
    return (el.text or "").strip() if el is not None else ""
