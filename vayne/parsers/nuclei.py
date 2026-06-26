"""Nuclei JSON parser."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

from vayne.models import Asset, Finding
from vayne.parsers.common import extract_cve, extract_cwe, merge_asset, new_id, now, parse_port


def parse(path: Path) -> tuple[list[Finding], list[Asset]]:
    data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    if not isinstance(data, list):
        data = [data]

    findings: list[Finding] = []
    assets: dict[str, Asset] = {}

    for item in data:
        host_raw = item.get("host", item.get("ip", ""))
        matched = item.get("matched-at", "")
        parsed = urlparse(matched if "://" in matched else f"http://{host_raw}")
        host = parsed.hostname or host_raw.split(":")[0]
        port = parse_port(parsed.port or (host_raw.split(":")[-1] if ":" in host_raw else None))

        info = item.get("info", {})
        title = item.get("template-id", info.get("name", "nuclei-finding"))
        text = f"{title} {matched} {info.get('description', '')}"
        severity = info.get("severity", "info")

        findings.append(
            Finding(
                id=new_id(),
                host=host,
                service=info.get("tags", ["web"])[0] if info.get("tags") else "web",
                port=port,
                severity=severity,
                cve=extract_cve(text),
                cwe=extract_cwe(text),
                title=title,
                description=info.get("description", ""),
                evidence=f"{matched} — {info.get('description', '')}".strip(" —"),
                confidence=75 if severity in ("critical", "high") else 55,
                source_tool="nuclei",
                timestamp=now(),
            )
        )
        merge_asset(assets, host, port=port, service="web", tag="nuclei")

    return findings, list(assets.values())
