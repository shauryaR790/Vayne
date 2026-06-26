"""Httpx JSON parser."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

from vayne.models import Asset, Finding
from vayne.parsers.common import merge_asset, new_id, now, parse_port


def parse(path: Path) -> tuple[list[Finding], list[Asset]]:
    raw = path.read_text(encoding="utf-8", errors="replace")
    data = json.loads(raw)
    if not isinstance(data, list):
        data = [data]

    findings: list[Finding] = []
    assets: dict[str, Asset] = {}

    for item in data:
        url = item.get("url", item.get("input", ""))
        parsed = urlparse(url)
        host = parsed.hostname or item.get("host", "")
        port = parse_port(parsed.port or item.get("port"))
        tech = item.get("tech", item.get("technologies", []))
        if isinstance(tech, list):
            technologies = tech
        else:
            technologies = [tech] if tech else []

        title = "Publicly accessible host" if item.get("status-code", 200) < 400 else "Host probe"
        findings.append(
            Finding(
                id=new_id(),
                host=host,
                service=item.get("scheme", "http"),
                port=port,
                severity="info",
                title=title,
                description=f"HTTP {item.get('status-code', '')} — {url}",
                evidence=str(item.get("header", item))[:500],
                confidence=80,
                source_tool="httpx",
                timestamp=now(),
            )
        )
        for t in technologies:
            merge_asset(assets, host, port=port, technology=t, tag="public")

    return findings, list(assets.values())
