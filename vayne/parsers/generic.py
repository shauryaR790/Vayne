"""Generic findings ingesters — the "does it work on my data" safety net.

Two heuristic parsers that let VANE accept tools it has no dedicated adapter
for, including cloud-posture (Prowler / ScoutSuite / Steampipe), EDR/misconfig
exports, and one-off CSV/JSON dumps:

* ``parse_csv`` — column-name heuristics (host/ip, port, severity, title, cve).
* ``parse_json`` — flat or nested findings with heuristic key detection.

These never raise on an unknown shape; they extract what they can and label the
source with the detected tool name so provenance survives.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

from vayne.models import Asset, Finding
from vayne.parsers.common import extract_cve, extract_cwe, merge_asset, new_id, now, parse_port

_HOST_KEYS = ("host", "hostname", "ip", "ip_address", "ipaddress", "asset", "target",
              "resource", "resource_id", "resourcename", "dns", "fqdn", "account", "endpoint")
_PORT_KEYS = ("port", "dport", "service_port")
_SEV_KEYS = ("severity", "risk", "risk_level", "criticality", "level", "priority")
_TITLE_KEYS = ("title", "name", "check_title", "check_id", "finding", "issue", "rule",
               "vulnerability", "message", "description", "summary")
_DESC_KEYS = ("description", "details", "detail", "remediation", "risk_details",
              "status_detail", "message", "solution", "info", "notes")
_CVE_KEYS = ("cve", "cve_id", "cves", "references")
_SEV_WORDS = {"critical", "high", "medium", "moderate", "low", "info", "informational",
              "warning", "error", "note"}
_SEV_NORMALIZE = {"moderate": "medium", "informational": "info", "warning": "medium",
                  "error": "high", "note": "low"}


def parse_csv(path: Path, tool: str = "generic") -> tuple[list[Finding], list[Asset]]:
    text = path.read_text(encoding="utf-8", errors="replace")
    reader = csv.DictReader(text.splitlines())
    findings: list[Finding] = []
    assets: dict[str, Asset] = {}
    for raw in reader:
        row = {(k or "").strip(): (v or "").strip() for k, v in raw.items() if k}
        if not any(row.values()):
            continue
        f = _finding_from_map(row, tool)
        if f is None:
            continue
        findings.append(f)
        merge_asset(assets, f.host, port=f.port, tag=tool)
    return findings, list(assets.values())


def parse_json(path: Path, tool: str = "generic") -> tuple[list[Finding], list[Asset]]:
    data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    records = _extract_records(data)
    findings: list[Finding] = []
    assets: dict[str, Asset] = {}
    detected = _detect_tool(data, tool)
    for rec in records:
        if not isinstance(rec, dict):
            continue
        flat = _flatten(rec)
        f = _finding_from_map(flat, detected)
        if f is None:
            continue
        findings.append(f)
        merge_asset(assets, f.host, port=f.port, tag=detected)
    return findings, list(assets.values())


def _extract_records(data) -> list:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("findings", "results", "vulnerabilities", "issues", "data", "items", "detections"):
            val = data.get(key)
            if isinstance(val, list):
                return val
        # Prowler v3 style: {"account": {...}, "findings": [...]} already covered.
        # Fall back to any list-valued field.
        for val in data.values():
            if isinstance(val, list) and val and isinstance(val[0], dict):
                return val
        return [data]
    return []


def _detect_tool(data, default: str) -> str:
    blob = json.dumps(data)[:2000].lower()
    for name in ("prowler", "scoutsuite", "steampipe", "checkov", "trivy", "kics",
                 "defender", "crowdstrike", "sentinelone", "wiz", "orca", "tenable"):
        if name in blob:
            return name
    return default


def _flatten(rec: dict, prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in rec.items():
        key = f"{prefix}{k}".lower()
        if isinstance(v, dict):
            out.update(_flatten(v, prefix=f"{key}_"))
        elif isinstance(v, list):
            out[key] = ", ".join(str(x) for x in v if not isinstance(x, (dict, list)))[:500]
        elif v is not None:
            out[key] = str(v)
    return out


def _finding_from_map(row: dict[str, str], tool: str) -> Finding | None:
    lowered = {k.lower(): v for k, v in row.items()}

    def pick(keys: tuple[str, ...]) -> str:
        for k in keys:
            for actual, val in lowered.items():
                if (actual == k or actual.endswith("_" + k) or actual.endswith(k)) and val:
                    return val
        return ""

    host = pick(_HOST_KEYS)
    title = pick(_TITLE_KEYS)
    if not host and not title:
        return None
    desc = pick(_DESC_KEYS)
    blob = " ".join(lowered.values())
    return Finding(
        id=new_id(),
        host=host or "unknown",
        port=parse_port(pick(_PORT_KEYS)),
        severity=_norm_sev(pick(_SEV_KEYS)),
        cve=extract_cve(pick(_CVE_KEYS) or blob),
        cwe=extract_cwe(blob),
        title=(title or "finding")[:200],
        description=desc[:400],
        evidence=(desc or title)[:500],
        confidence=60,
        source_tool=tool,
        timestamp=now(),
    )


def _norm_sev(value: str) -> str:
    v = (value or "").strip().lower()
    if v in _SEV_WORDS:
        return _SEV_NORMALIZE.get(v, v)
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
