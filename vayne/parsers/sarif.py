"""SARIF 2.1.0 parser (Burp Enterprise, and most DAST/SAST exporters).

SARIF is the common denominator for enterprise web/app scanners. This reads
``runs[].results[]``, resolving rule metadata from ``runs[].tool.driver.rules``
so titles, CWE tags and severities are recovered even when the result only
carries a ``ruleId``. The originating tool name is preserved as metadata.
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

from vayne.models import Asset, Finding
from vayne.parsers.common import extract_cve, extract_cwe, merge_asset, new_id, now, parse_port

_LEVEL_SEV = {"error": "high", "warning": "medium", "note": "low", "none": "info"}
_SEC_SEV = [  # security-severity is a CVSS-like float in SARIF properties
    (9.0, "critical"), (7.0, "high"), (4.0, "medium"), (0.1, "low"), (0.0, "info"),
]


def parse(path: Path) -> tuple[list[Finding], list[Asset]]:
    data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    findings: list[Finding] = []
    assets: dict[str, Asset] = {}

    for run in data.get("runs", []) or []:
        driver = ((run.get("tool") or {}).get("driver") or {})
        tool_name = (driver.get("name") or "sarif").lower().replace(" ", "-")
        rules = {r.get("id", ""): r for r in (driver.get("rules") or [])}

        for res in run.get("results", []) or []:
            rule = rules.get(res.get("ruleId", ""), {})
            title = (
                _text(res.get("message"))
                or _text(rule.get("shortDescription"))
                or rule.get("name")
                or res.get("ruleId")
                or "sarif-finding"
            )
            body = " ".join(
                s for s in (
                    _text(res.get("message")),
                    _text(rule.get("fullDescription")),
                    _text(rule.get("help")),
                ) if s
            )
            host, port = _locate(res)
            severity = _severity(res, rule)
            tags = " ".join((rule.get("properties") or {}).get("tags", []) or [])

            findings.append(
                Finding(
                    id=new_id(),
                    host=host or "unknown",
                    port=port,
                    severity=severity,
                    cve=extract_cve(f"{title} {body} {tags}"),
                    cwe=extract_cwe(f"{res.get('ruleId','')} {tags} {body}"),
                    title=title[:200],
                    description=body[:400],
                    evidence=body[:500] or title[:500],
                    confidence=66,
                    source_tool=tool_name,
                    timestamp=now(),
                )
            )
            if host:
                merge_asset(assets, host, port=port, tag=tool_name)

    return findings, list(assets.values())


def _text(node) -> str:
    if isinstance(node, dict):
        return (node.get("text") or node.get("markdown") or "").strip()
    if isinstance(node, str):
        return node.strip()
    return ""


def _locate(res: dict) -> tuple[str, int | None]:
    for loc in res.get("locations", []) or []:
        phys = (loc.get("physicalLocation") or {})
        art = (phys.get("artifactLocation") or {})
        uri = art.get("uri") or ""
        if uri:
            parsed = urlparse(uri)
            if parsed.netloc:
                return parsed.hostname or parsed.netloc, parsed.port
            return uri, None
    # Web results often carry the target under properties.
    props = res.get("properties") or {}
    for key in ("host", "url", "target", "uri"):
        if props.get(key):
            parsed = urlparse(str(props[key]))
            return (parsed.hostname or parsed.netloc or str(props[key])), parsed.port
    return "", None


def _severity(res: dict, rule: dict) -> str:
    props = {**(rule.get("properties") or {}), **(res.get("properties") or {})}
    sec = props.get("security-severity")
    if sec is not None:
        try:
            score = float(sec)
            for threshold, label in _SEC_SEV:
                if score >= threshold:
                    return label
        except (TypeError, ValueError):
            pass
    level = res.get("level") or rule.get("defaultConfiguration", {}).get("level") or "warning"
    return _LEVEL_SEV.get(str(level).lower(), "medium")
