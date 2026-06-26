"""Nuclei JSON output parser."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from vayne.models.schemas import RawFinding


def parse_nuclei_json(path: Path) -> list[RawFinding]:
    data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    if not isinstance(data, list):
        data = [data]

    findings: list[RawFinding] = []
    for item in data:
        host = item.get("host", item.get("ip", ""))
        port = ""
        matched = item.get("matched-at", "")
        if ":" in host and host.count(":") == 1:
            host_part, port_part = host.rsplit(":", 1)
            if port_part.isdigit():
                host, port = host_part, port_part

        info = item.get("info", {})
        findings.append(
            RawFinding(
                id=str(uuid.uuid4())[:12],
                tool="nuclei",
                host=host,
                port=port or _extract_port(matched),
                service=info.get("tags", [""])[0] if info.get("tags") else "",
                version="",
                finding=item.get("template-id", info.get("name", "unknown")),
                severity=info.get("severity", "info"),
                evidence=matched or item.get("curl-command", ""),
            )
        )
    return findings


def _extract_port(matched: str) -> str:
    if not matched:
        return ""
    if "://" in matched:
        rest = matched.split("://", 1)[1]
        if ":" in rest.split("/")[0]:
            return rest.split("/")[0].split(":")[-1]
    return ""
