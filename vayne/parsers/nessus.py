"""Nessus CSV export parser."""

from __future__ import annotations

import csv
import uuid
from pathlib import Path

from vayne.models.schemas import RawFinding


def parse_nessus_csv(path: Path) -> list[RawFinding]:
    findings: list[RawFinding] = []
    with path.open(encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            host = row.get("Host", row.get("IP Address", ""))
            port = row.get("Port", "")
            name = row.get("Name", row.get("Plugin Name", "nessus-finding"))
            severity = (row.get("Risk", row.get("Severity", "info")) or "info").lower()
            plugin_output = row.get("Plugin Output", row.get("Description", ""))

            findings.append(
                RawFinding(
                    id=str(uuid.uuid4())[:12],
                    tool="nessus",
                    host=host,
                    port=str(port),
                    service=row.get("Protocol", ""),
                    version=row.get("Plugin ID", ""),
                    finding=name,
                    severity=_normalize_severity(severity),
                    evidence=plugin_output[:500] if plugin_output else "",
                )
            )
    return findings


def _normalize_severity(sev: str) -> str:
    s = sev.lower().strip()
    mapping = {
        "critical": "critical",
        "high": "high",
        "medium": "medium",
        "low": "low",
        "none": "info",
        "info": "info",
    }
    return mapping.get(s, "info")
