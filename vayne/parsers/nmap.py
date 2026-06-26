"""Nmap XML output parser."""

from __future__ import annotations

import uuid
import xml.etree.ElementTree as ET
from pathlib import Path

from vayne.models.schemas import RawFinding


def parse_nmap_xml(path: Path) -> list[RawFinding]:
    tree = ET.parse(path)
    root = tree.getroot()
    findings: list[RawFinding] = []

    for host in root.findall("host"):
        addr_el = host.find("address[@addrtype='ipv4']")
        if addr_el is None:
            addr_el = host.find("address")
        host_addr = addr_el.get("addr", "") if addr_el is not None else ""

        for port in host.findall(".//port"):
            port_id = port.get("portid", "")
            state = port.find("state")
            if state is not None and state.get("state") != "open":
                continue

            service = port.find("service")
            svc_name = service.get("name", "") if service is not None else ""
            product = service.get("product", "") if service is not None else ""
            version = service.get("version", "") if service is not None else ""
            full_version = f"{product} {version}".strip()

            for script in port.findall("script"):
                findings.append(
                    RawFinding(
                        id=str(uuid.uuid4())[:12],
                        tool="nmap",
                        host=host_addr,
                        port=port_id,
                        service=svc_name,
                        version=full_version,
                        finding=script.get("id", "nmap-script"),
                        severity=_script_severity(script.get("id", "")),
                        evidence=(script.find("elem").text if script.find("elem") is not None else script.get("output", "")),
                    )
                )

            if svc_name:
                findings.append(
                    RawFinding(
                        id=str(uuid.uuid4())[:12],
                        tool="nmap",
                        host=host_addr,
                        port=port_id,
                        service=svc_name,
                        version=full_version,
                        finding=f"{svc_name} {full_version}".strip() or svc_name,
                        severity="info",
                        evidence=f"open port {port_id}/{svc_name}",
                    )
                )
    return findings


def _script_severity(script_id: str) -> str:
    sid = script_id.lower()
    if "vuln" in sid or "cve" in sid:
        return "high"
    if "ssl" in sid or "http" in sid:
        return "medium"
    return "info"
