"""Naabu port scan JSON parser."""

from __future__ import annotations

import json
from pathlib import Path

from vayne.models import Asset, Finding
from vayne.parsers.common import merge_asset, new_id, now, parse_port


def parse(path: Path) -> tuple[list[Finding], list[Asset]]:
    data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    if not isinstance(data, list):
        data = [data]

    findings: list[Finding] = []
    assets: dict[str, Asset] = {}

    for item in data:
        host = item.get("host", item.get("ip", ""))
        port = parse_port(item.get("port"))
        findings.append(
            Finding(
                id=new_id(),
                host=host,
                port=port,
                severity="info",
                title=f"Open port {port}",
                description=f"Naabu discovered open port {port} on {host}",
                evidence=json.dumps(item)[:300],
                confidence=90,
                source_tool="naabu",
                timestamp=now(),
            )
        )
        merge_asset(assets, host, ip=item.get("ip", host), port=port, tag="naabu")

    return findings, list(assets.values())
