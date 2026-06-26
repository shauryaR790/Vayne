"""Nessus XML (.nessus) parser."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

from vayne.models import Asset, Finding
from vayne.parsers.common import extract_cve, extract_cwe, merge_asset, new_id, now, parse_port


def parse(path: Path) -> tuple[list[Finding], list[Asset]]:
    root = ET.parse(path).getroot()
    findings: list[Finding] = []
    assets: dict[str, Asset] = {}

    for host in root.findall(".//ReportHost"):
        hostname = host.get("name", "unknown")
        for item in host.findall("ReportItem"):
            port = parse_port(item.get("port"))
            plugin_name = item.get("pluginName", "nessus-finding")
            severity = _normalize_sev(item.get("severity", "0"))
            output_el = item.find("plugin_output")
            output = (output_el.text or "").strip() if output_el is not None else ""

            findings.append(
                Finding(
                    id=new_id(),
                    host=hostname,
                    service=item.get("protocol", ""),
                    port=port,
                    severity=severity,
                    cve=extract_cve(f"{plugin_name} {output}"),
                    cwe=extract_cwe(output),
                    title=plugin_name,
                    description=output[:400],
                    evidence=output[:500],
                    confidence=70,
                    source_tool="nessus",
                    timestamp=now(),
                )
            )
            merge_asset(assets, hostname, port=port, tag="nessus")

    return findings, list(assets.values())


def _normalize_sev(sev: str) -> str:
    mapping = {"0": "info", "1": "low", "2": "medium", "3": "high", "4": "critical"}
    s = str(sev).lower().strip()
    return mapping.get(s, s if s else "info")
