"""OpenVAS XML parser."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

from vayne.models import Asset, Finding
from vayne.parsers.common import extract_cve, merge_asset, new_id, now, parse_port


def parse(path: Path) -> tuple[list[Finding], list[Asset]]:
    root = ET.parse(path).getroot()
    findings: list[Finding] = []
    assets: dict[str, Asset] = {}

    for result in root.findall(".//result"):
        host = _txt(result, "host") or _txt(result, "ip")
        port = parse_port(_txt(result, "port"))
        nvt = result.find("nvt")
        name = _txt(nvt, "name") if nvt is not None else _txt(result, "name")
        desc = _txt(result, "description") or _txt(nvt, "tags")
        severity = _score_to_sev(_txt(result, "severity"))

        findings.append(
            Finding(
                id=new_id(),
                host=host,
                port=port,
                severity=severity,
                cve=extract_cve(f"{name} {desc}"),
                title=name or "openvas-finding",
                description=desc[:400],
                evidence=desc[:500],
                confidence=68,
                source_tool="openvas",
                timestamp=now(),
            )
        )
        merge_asset(assets, host, port=port, tag="openvas")

    return findings, list(assets.values())


def _txt(parent: ET.Element | None, tag: str) -> str:
    if parent is None:
        return ""
    el = parent.find(tag)
    return (el.text or "").strip() if el is not None else ""


def _score_to_sev(score: str) -> str:
    try:
        v = float(score)
    except ValueError:
        return score.lower() or "info"
    if v >= 9:
        return "critical"
    if v >= 7:
        return "high"
    if v >= 4:
        return "medium"
    if v > 0:
        return "low"
    return "info"
