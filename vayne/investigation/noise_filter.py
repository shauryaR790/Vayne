"""Suppress noise before investigations are generated (Rule 8).

Observations that do not change risk are filtered here — never promoted to
analyst-facing investigations.
"""

from __future__ import annotations

import re
from typing import Any

from vayne.models import Classification, CorrelatedFinding, InvestigatedFinding, ValidationResult

_SERVICE_ONLY = re.compile(
    r"(?i)^(ssh|http|https|smb|ftp|smtp|dns|telnet|rdp|vnc|pop3|imap|"
    r"mysql|postgres|mssql|redis|mongodb|snmp|ntp|tcpwrapped)\b"
)
_INFO_TITLE = re.compile(
    r"(?i)(server detection|service detection|open port|general service|"
    r"traceroute|nping|echo reply|informational)"
)


def is_pure_observation(corr: CorrelatedFinding, validation: ValidationResult) -> bool:
    if corr.cve:
        return False
    if validation.classification in (Classification.CONFIRMED, Classification.LIKELY_EXPLOITABLE):
        return False
    title = (corr.title or "").strip()
    if _SERVICE_ONLY.match(title):
        return True
    if _INFO_TITLE.search(title):
        return True
    if validation.classification == Classification.FALSE_POSITIVE:
        return True
    if validation.overall_confidence < 25 and not corr.cve:
        return True
    return False


def is_duplicate_cve(corr: CorrelatedFinding, seen_cves: set[str]) -> bool:
    cve = (corr.cve or "").strip().upper()
    if not cve:
        return False
    host = (corr.host or "").strip().lower()
    key = f"{cve}|{host}"
    if key in seen_cves:
        return True
    seen_cves.add(key)
    return False


def is_contradicted_heavily(validation: ValidationResult) -> bool:
    contra = validation.contradicting_evidence or []
    if len(contra) >= 2 and validation.overall_confidence < 40:
        return True
    return False


def filter_investigated_findings(
    findings: list[InvestigatedFinding],
) -> tuple[list[InvestigatedFinding], dict[str, Any]]:
    """Return actionable findings and suppression statistics."""
    kept: list[InvestigatedFinding] = []
    suppressed: list[dict[str, Any]] = []
    seen_cves: set[str] = set()

    for item in findings:
        corr = item.correlated
        val = item.validation
        reason = ""

        if val.classification == Classification.FALSE_POSITIVE:
            reason = "false_positive"
        elif is_pure_observation(corr, val):
            reason = "service_observation"
        elif is_contradicted_heavily(val):
            reason = "contradicted"
        elif is_duplicate_cve(corr, seen_cves):
            reason = "duplicate_cve"

        if reason:
            suppressed.append(
                {
                    "finding_id": corr.id,
                    "title": corr.title,
                    "host": corr.host,
                    "reason": reason,
                }
            )
            continue
        kept.append(item)

    stats = {
        "input": len(findings),
        "retained": len(kept),
        "suppressed": len(suppressed),
        "by_reason": _count_reasons(suppressed),
    }
    return kept, {"suppressed": suppressed, "statistics": stats}


def _count_reasons(rows: list[dict[str, Any]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for row in rows:
        r = str(row.get("reason") or "other")
        out[r] = out.get(r, 0) + 1
    return out
