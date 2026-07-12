"""Validation probe framework.

A ``ValidationProbe`` describes a concrete, safe action that would raise (or
lower) confidence in a finding — an HTTP replay, a TLS handshake, an
authenticated re-check, an exploit reproduction. By default probes are
*planned*, never executed: the engine emits the exact steps an operator (or a
future executor) would run, plus the expected confidence gain if it succeeds.

An operator can register a real executor by subclassing ``ValidationProbe`` and
overriding ``execute``; the rest of the engine consumes the same ``ProbePlan``
shape either way, so nothing downstream changes when live execution is enabled.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from vayne.models import CorrelatedFinding


@dataclass
class ProbePlan:
    probe_id: str
    name: str
    method: str                 # http_replay | tls_handshake | auth_recheck | exploit_replay | banner_refetch
    target: str
    steps: list[str]
    confirms: str               # what a success confirms
    expected_gain: int          # confidence points a success would add
    executed: bool = False
    result: str = "planned"     # planned | confirmed | refuted | error
    detail: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "probe_id": self.probe_id,
            "name": self.name,
            "method": self.method,
            "target": self.target,
            "steps": self.steps,
            "confirms": self.confirms,
            "expected_gain": self.expected_gain,
            "executed": self.executed,
            "result": self.result,
            "detail": self.detail,
        }


# A builder returns a ProbePlan for a finding, or None if not applicable.
ProbeBuilder = Callable[[CorrelatedFinding], ProbePlan | None]


def _target(finding: CorrelatedFinding) -> str:
    host = finding.host or "target"
    return f"{host}:{finding.port}" if finding.port else host


def _is_web(finding: CorrelatedFinding) -> bool:
    svc = (finding.service or "").lower()
    ent = (finding.canonical_entity.service if finding.canonical_entity else "") or ""
    text = f"{svc} {ent} {finding.title}".lower()
    if any(k in text for k in ("http", "web", "apache", "nginx", "iis", "tomcat", "jenkins", "grafana")):
        return True
    return finding.port in (80, 443, 8080, 8443, 8000, 8888)


def _is_tls(finding: CorrelatedFinding) -> bool:
    text = f"{finding.service} {finding.title}".lower()
    return "tls" in text or "ssl" in text or "cert" in text or finding.port in (443, 8443, 993, 995, 465)


def _has_cve(finding: CorrelatedFinding) -> bool:
    return bool((finding.cve or "").strip())


def _build_http_replay(finding: CorrelatedFinding) -> ProbePlan | None:
    if not _is_web(finding):
        return None
    return ProbePlan(
        probe_id=f"replay-http-{finding.id}",
        name="HTTP fingerprint replay",
        method="http_replay",
        target=_target(finding),
        steps=[
            f"Re-request the identified endpoint on {_target(finding)}",
            "Capture full response headers and server banner",
            "Compare Server/version header against the correlated version",
            "Diff the response body signature against the recorded fingerprint",
        ],
        confirms="the service and version are live and not a proxied/stale banner",
        expected_gain=12,
    )


def _build_exploit_replay(finding: CorrelatedFinding) -> ProbePlan | None:
    if not _has_cve(finding):
        return None
    return ProbePlan(
        probe_id=f"replay-exploit-{finding.id}",
        name=f"Exploit reproduction for {finding.cve}",
        method="exploit_replay",
        target=_target(finding),
        steps=[
            f"Confirm prerequisites for {finding.cve} on {_target(finding)}",
            "Send the minimal non-destructive proof-of-concept payload",
            "Capture the response / command output that proves execution",
            "Record success or failure and attach the transcript as evidence",
        ],
        confirms="the vulnerability is actually exploitable (moves exploit confidence to confirmed)",
        expected_gain=28,
    )


def _build_tls_handshake(finding: CorrelatedFinding) -> ProbePlan | None:
    if not _is_tls(finding):
        return None
    return ProbePlan(
        probe_id=f"tls-{finding.id}",
        name="TLS handshake + certificate inspection",
        method="tls_handshake",
        target=_target(finding),
        steps=[
            f"Open a TLS connection to {_target(finding)}",
            "Enumerate offered protocol versions and cipher suites",
            "Capture the presented certificate chain and validity",
            "Compare against the reported TLS/cert finding",
        ],
        confirms="the TLS posture reported passively (upgrades a passive banner)",
        expected_gain=10,
    )


def _build_auth_recheck(finding: CorrelatedFinding) -> ProbePlan | None:
    # Applicable to everything: an authenticated re-check is the strongest
    # non-exploit confirmation available.
    return ProbePlan(
        probe_id=f"auth-{finding.id}",
        name="Authenticated re-check",
        method="auth_recheck",
        target=_target(finding),
        steps=[
            f"Authenticate to {_target(finding)} with in-scope credentials",
            "Query the installed package/build version from the host itself",
            "Confirm patch level and configuration from the authenticated view",
            "Reconcile the authenticated result with the passive observation",
        ],
        confirms="the observation from an authenticated vantage point (highest reliability)",
        expected_gain=18,
    )


class ProbeRegistry:
    """Ordered set of probe builders. Operators can register custom probes."""

    def __init__(self) -> None:
        self._builders: list[ProbeBuilder] = []

    def register(self, builder: ProbeBuilder) -> None:
        self._builders.append(builder)

    def plan(self, finding: CorrelatedFinding) -> list[ProbePlan]:
        plans: list[ProbePlan] = []
        for builder in self._builders:
            plan = builder(finding)
            if plan is not None:
                plans.append(plan)
        # Highest-value probe first — deterministic and analyst-friendly.
        plans.sort(key=lambda p: (-p.expected_gain, p.probe_id))
        return plans


def default_registry() -> ProbeRegistry:
    reg = ProbeRegistry()
    reg.register(_build_exploit_replay)
    reg.register(_build_auth_recheck)
    reg.register(_build_http_replay)
    reg.register(_build_tls_handshake)
    return reg
