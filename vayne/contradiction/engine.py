"""Contradiction Engine (Priority 6).

Conflicts between scanners are promoted to first-class objects. A contradiction
is never silently absorbed into a lower score — it is recorded with its severity,
its explicit confidence impact, its likely cause, and the concrete action that
would resolve it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from vayne.correlator.normalization import extract_version
from vayne.models import CorrelatedFinding

_ALIVE_RE = re.compile(r"(?i)\b(host up|host alive|is up|responded|reachable|open)\b")
_DEAD_RE = re.compile(r"(?i)\b(host down|unreachable|no response|timed out|filtered|not responding)\b")


@dataclass
class Conflict:
    id: str
    kind: str  # version | reachability | severity | port_state | service_identity
    subject: str
    host: str
    statements: list[dict[str, str]]
    severity: str  # low | medium | high
    confidence_impact: int  # negative percentage points
    likely_causes: list[str]
    suggested_action: str
    detail: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "subject": self.subject,
            "host": self.host,
            "statements": self.statements,
            "severity": self.severity,
            "confidence_impact": self.confidence_impact,
            "likely_causes": self.likely_causes,
            "suggested_action": self.suggested_action,
            "detail": self.detail,
        }


# Documented impact / metadata per contradiction class.
_CONFLICT_SPEC: dict[str, dict[str, Any]] = {
    "version": {
        "severity": "medium",
        "impact": -13,
        "causes": ["patch-level ambiguity", "cached or stale banner", "load-balanced backends"],
        "action": "Replay an HTTP/service fingerprint to establish the authoritative version",
    },
    "reachability": {
        "severity": "high",
        "impact": -18,
        "causes": ["firewall / ACL", "scan timing", "VPN or split routing"],
        "action": "Re-test reachability from a single, consistent vantage point",
    },
    "severity": {
        "severity": "low",
        "impact": -4,
        "causes": ["different scanner scoring models"],
        "action": "Normalize severity to a single taxonomy (CVSS)",
    },
    "port_state": {
        "severity": "medium",
        "impact": -10,
        "causes": ["stateful firewall", "rate limiting", "transient service"],
        "action": "Re-probe the port and confirm the service state",
    },
    "service_identity": {
        "severity": "medium",
        "impact": -11,
        "causes": ["shared port", "protocol multiplexing", "misidentified banner"],
        "action": "Run a targeted service probe to disambiguate the service",
    },
}


def _spec(kind: str, statements: list[dict[str, str]], subject: str, host: str, detail: str) -> Conflict:
    spec = _CONFLICT_SPEC.get(kind, _CONFLICT_SPEC["severity"])
    cid = f"conflict:{host}:{kind}:{abs(hash((subject, kind, tuple(sorted(s['source'] for s in statements))))) % 100000}"
    return Conflict(
        id=cid,
        kind=kind,
        subject=subject,
        host=host,
        statements=statements,
        severity=spec["severity"],
        confidence_impact=spec["impact"],
        likely_causes=list(spec["causes"]),
        suggested_action=spec["action"],
        detail=detail,
    )


def build_conflicts(finding: CorrelatedFinding) -> list[Conflict]:
    """Promote every detectable contradiction on a finding to a Conflict object."""
    conflicts: list[Conflict] = []
    subject = (
        finding.canonical_entity.label if finding.canonical_entity else finding.title
    ) or finding.title
    host = finding.host

    # Structured conflicts already recorded by the correlation engine.
    for ec in finding.conflicts or []:
        if ec.kind == "version":
            stmts = _version_statements(finding)
            conflicts.append(
                _spec("version", stmts, subject, host,
                      ec.detail or "Scanners reported different versions.")
            )
        elif ec.kind == "severity":
            stmts = [
                {"source": (f.source_tool or "scan"), "claim": (f.severity or "info").title()}
                for f in finding.findings if f.severity
            ][:6]
            conflicts.append(
                _spec("severity", stmts, subject, host,
                      ec.detail or "Scanners assigned different severities.")
            )
        elif ec.kind == "host":
            conflicts.append(
                _spec("service_identity", list(ec.statements and
                      [{"source": "scan", "claim": s} for s in ec.statements] or []),
                      subject, host, ec.detail or "Host identity disagreement.")
            )

    # Reachability disagreement detected from raw evidence markers.
    reach = _reachability_conflict(finding, subject, host)
    if reach:
        conflicts.append(reach)

    return _dedupe(conflicts)


def _version_statements(finding: CorrelatedFinding) -> list[dict[str, str]]:
    seen: dict[str, str] = {}
    for f in finding.findings:
        ver = extract_version(f.title, f.service, f.evidence)
        if ver and f.source_tool not in seen:
            seen[f.source_tool] = ver
    return [{"source": tool, "claim": ver} for tool, ver in seen.items()][:6]


def _reachability_conflict(
    finding: CorrelatedFinding, subject: str, host: str
) -> Conflict | None:
    alive: list[str] = []
    dead: list[str] = []
    for f in finding.findings:
        blob = f"{f.title} {f.evidence} {f.description}"
        if _ALIVE_RE.search(blob):
            alive.append(f.source_tool or "scan")
        if _DEAD_RE.search(blob):
            dead.append(f.source_tool or "scan")
    if alive and dead:
        statements = (
            [{"source": s, "claim": "host reachable"} for s in _uniq(alive)]
            + [{"source": s, "claim": "host unreachable"} for s in _uniq(dead)]
        )
        return _spec(
            "reachability", statements[:6], subject, host,
            "Scanners disagree on whether the host is reachable.",
        )
    return None


def _uniq(items: list[str]) -> list[str]:
    out: list[str] = []
    for i in items:
        if i not in out:
            out.append(i)
    return out


def _dedupe(conflicts: list[Conflict]) -> list[Conflict]:
    seen: set[str] = set()
    out: list[Conflict] = []
    for c in conflicts:
        key = f"{c.kind}|{c.host}|{c.subject}"
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out
