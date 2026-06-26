"""Nmap XML parser."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

from vayne.models import Asset, Finding
from vayne.parsers.common import extract_cve, merge_asset, new_id, now, parse_port


def parse(path: Path) -> tuple[list[Finding], list[Asset]]:
    root = ET.parse(path).getroot()
    findings: list[Finding] = []
    assets: dict[str, Asset] = {}

    for host in root.findall("host"):
        addr_el = host.find("address[@addrtype='ipv4']")
        if addr_el is None:
            addr_el = host.find("address")
        addr = addr_el
        ip = addr.get("addr", "") if addr is not None else ""
        hostname_el = host.find("hostnames/hostname")
        hostname = hostname_el.get("name", ip) if hostname_el is not None else ip

        for port in host.findall(".//port"):
            state = port.find("state")
            if state is not None and state.get("state") != "open":
                continue
            port_id = parse_port(port.get("portid"))
            svc = port.find("service")
            svc_name = svc.get("name", "") if svc is not None else ""
            product = (svc.get("product", "") if svc is not None else "") + " " + (
                svc.get("version", "") if svc is not None else ""
            )
            version = product.strip()

            merge_asset(
                assets,
                hostname,
                ip=ip,
                port=port_id,
                service=svc_name,
                technology=version,
                tag="nmap",
            )

            for script in port.findall("script"):
                output = script.get("output", "")
                findings.append(
                    Finding(
                        id=new_id(),
                        host=hostname,
                        service=svc_name,
                        port=port_id,
                        severity="high" if "VULN" in script.get("id", "").upper() else "info",
                        cve=extract_cve(output),
                        title=script.get("id", "nmap-script"),
                        description=output[:300],
                        evidence=output[:500],
                        confidence=70,
                        source_tool="nmap",
                        timestamp=now(),
                    )
                )

            if svc_name:
                findings.append(
                    Finding(
                        id=new_id(),
                        host=hostname,
                        service=svc_name,
                        port=port_id,
                        severity="info",
                        title=f"{svc_name} {version}".strip(),
                        description=f"Open {svc_name} on port {port_id}",
                        evidence=version,
                        confidence=85,
                        source_tool="nmap",
                        timestamp=now(),
                    )
                )

    return findings, list(assets.values())
