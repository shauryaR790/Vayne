"""Filter inventory findings from the attack graph."""

from __future__ import annotations

import re

from vayne.models import CorrelatedFinding

INVENTORY_TITLE = (
    re.compile(r"^Open port \d+$", re.I),
    re.compile(r"^Publicly accessible host$", re.I),
    re.compile(r"^Discovered endpoint:", re.I),
    re.compile(r"^Host probe$", re.I),
    re.compile(r"^https?\s+\w", re.I),
)


def is_inventory_finding(cf: CorrelatedFinding) -> bool:
    """Report labels and scan inventory are NOT graph vulnerabilities."""
    if cf.cve:
        return False

    title = cf.title.strip()
    if any(p.match(title) for p in INVENTORY_TITLE):
        return True

    lower = title.lower()
    if "publicly accessible" in lower:
        return True
    if lower.startswith("discovered endpoint"):
        return True
    if re.match(r"^open port \d+$", lower):
        return True

    if cf.severity.lower() in ("critical", "high", "medium"):
        return False

    if cf.severity.lower() == "info" and cf.sources == ["nmap"]:
        return True

    return False


def is_security_finding(cf: CorrelatedFinding) -> bool:
    return not is_inventory_finding(cf)
