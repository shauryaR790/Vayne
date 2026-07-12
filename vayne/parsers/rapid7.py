"""Rapid7 Nexpose / InsightVM XML parser.

Supports the Nexpose "XML Export" and "XML Export 2.0" shapes:
``<nodes><node address=...><tests>`` / ``<vulnerabilities><vulnerability>``.
Severity is Nexpose's 0..10 CVSS-like score or a low/moderate/severe/critical
band, normalized to VANE's severity vocabulary.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

from vayne.models import Asset, Finding
from vayne.parsers.common import extract_cve, extract_cwe, merge_asset, new_id, now, parse_port


def parse(path: Path) -> tuple[list[Finding], list[Asset]]:
    root = ET.parse(path).getroot()
    findings: list[Finding] = []
    assets: dict[str, Asset] = {}

    # Definitions carry titles/severity keyed by vuln id.
    definitions: dict[str, dict[str, str]] = {}
    for vd in root.iter("VulnerabilityDefinition"):
        vid = vd.get("id", "")
        definitions[vid] = {
            "title": vd.get("title", ""),
            "severity": vd.get("severity", ""),
            "cve": _first_cve(vd),
            "desc": _inner_text(vd.find("description")),
        }

    for node in root.iter("node"):
        address = node.get("address", "") or node.get("name", "") or "unknown"
        names = [n.text for n in node.iter("name") if n is not None and n.text]
        host_id = (names[0].strip() if names else "") or address

        for test in node.iter("test"):
            if test.get("status", "") not in ("vulnerable-exploited", "vulnerable-version", "vulnerable-potential", ""):
                continue
            vid = test.get("id", "")
            definition = definitions.get(vid, {})
            title = definition.get("title") or vid or "rapid7-finding"
            body = _inner_text(test) or definition.get("desc", "")
            cve = definition.get("cve") or extract_cve(f"{title} {body}")
            severity = _sev(definition.get("severity", ""))

            findings.append(
                Finding(
                    id=new_id(),
                    host=host_id,
                    severity=severity,
                    cve=cve,
                    cwe=extract_cwe(body),
                    title=title,
                    description=body[:400],
                    evidence=body[:500],
                    confidence=71,
                    source_tool="rapid7",
                    timestamp=now(),
                )
            )
            merge_asset(assets, host_id, ip=address, tag="rapid7")

        # InsightVM "vulnerability" nodes carry inline severity as an attribute.
        for vuln in node.iter("vulnerability"):
            title = vuln.get("title") or vuln.get("id") or "rapid7-finding"
            body = _inner_text(vuln)
            findings.append(
                Finding(
                    id=new_id(),
                    host=host_id,
                    severity=_sev(vuln.get("severity", "")),
                    cve=extract_cve(f"{title} {body}"),
                    cwe=extract_cwe(body),
                    title=title,
                    description=body[:400],
                    evidence=body[:500],
                    confidence=71,
                    source_tool="rapid7",
                    timestamp=now(),
                )
            )
            merge_asset(assets, host_id, ip=address, tag="rapid7")

    return findings, list(assets.values())


def _sev(value: str) -> str:
    v = (value or "").strip().lower()
    band = {"critical": "critical", "severe": "high", "high": "high",
            "moderate": "medium", "medium": "medium", "low": "low"}
    if v in band:
        return band[v]
    try:
        score = float(v)
    except ValueError:
        return "info"
    if score >= 9:
        return "critical"
    if score >= 7:
        return "high"
    if score >= 4:
        return "medium"
    if score > 0:
        return "low"
    return "info"


def _first_cve(el: ET.Element) -> str:
    for ref in el.iter("reference"):
        if (ref.get("source", "") or "").upper() == "CVE" and ref.text:
            return ref.text.strip().upper()
    return extract_cve(_inner_text(el))


def _inner_text(el: ET.Element | None) -> str:
    if el is None:
        return ""
    return " ".join(t.strip() for t in el.itertext() if t and t.strip())[:800]
