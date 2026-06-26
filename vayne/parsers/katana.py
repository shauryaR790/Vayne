"""Katana crawl JSON parser."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

from vayne.models import Asset, Finding
from vayne.parsers.common import merge_asset, new_id, now, parse_port


def parse(path: Path) -> tuple[list[Finding], list[Asset]]:
    data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    if not isinstance(data, list):
        data = [data]

    findings: list[Finding] = []
    assets: dict[str, Asset] = {}

    for item in data:
        endpoint = item.get("endpoint", item.get("request", {}).get("endpoint", ""))
        parsed = urlparse(endpoint)
        host = parsed.hostname or ""
        port = parse_port(parsed.port)
        tag = item.get("tag", item.get("source", "crawl"))

        findings.append(
            Finding(
                id=new_id(),
                host=host,
                port=port,
                severity="info",
                title=f"Discovered endpoint: {endpoint[:80]}",
                description=item.get("response", {}).get("body", "")[:200],
                evidence=endpoint,
                confidence=60,
                source_tool="katana",
                timestamp=now(),
            )
        )
        merge_asset(assets, host, port=port, tag=str(tag))

    return findings, list(assets.values())
