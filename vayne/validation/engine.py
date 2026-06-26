"""Finding validation engine."""

from __future__ import annotations

import re

from vayne.models.schemas import CorrelatedFinding, ValidationResult

AUTH_MARKERS = (
    "login",
    "authentication",
    "401",
    "403",
    "unauthorized",
    "sign in",
    "password",
)
PUBLIC_MARKERS = ("publicly accessible", "no authentication", "unauthenticated", "anonymous")
VULN_APACHE_2449 = re.compile(r"2\.4\.(4[0-9]|5[0-8])")
VULN_APACHE_2459 = re.compile(r"2\.4\.59")


def validate(finding: CorrelatedFinding) -> ValidationResult:
    """Run validation checks against a correlated finding."""
    reasoning: list[str] = []
    text = _context(finding)

    host_alive = bool(finding.host)
    if host_alive:
        reasoning.append("host reachable")

    port_reachable = bool(finding.port) or "nmap" in finding.sources
    if port_reachable:
        reasoning.append("port open" if finding.port else "service exposure confirmed")

    service_confirmed = bool(finding.service) or any(
        f.tool == "nmap" for f in finding.raw_findings
    )
    if service_confirmed:
        reasoning.append("service fingerprint confirmed")

    version_confirmed = bool(finding.version) or _version_in_evidence(finding)
    if version_confirmed:
        reasoning.append("version confirmed")

    auth_required = _auth_required(text)
    if auth_required:
        reasoning.append("authentication required")
    elif "httpx" in finding.sources or "public" in text:
        reasoning.append("authentication not required")

    prerequisites_met = _prerequisites_met(finding, text)
    if prerequisites_met:
        reasoning.append("exploit prerequisites satisfied")
    elif auth_required:
        reasoning.append("exploit prerequisites not met")

    exploit_failed = "exploit failed" in text or "unsuccessful" in text
    if exploit_failed:
        reasoning.append("safe exploit validation failed")

    exploitation_possible = (
        host_alive
        and service_confirmed
        and prerequisites_met
        and not auth_required
        and not exploit_failed
    )

    likely_fp = (
        auth_required
        or exploit_failed
        or (not version_confirmed and "nuclei" in finding.sources and len(finding.sources) < 2)
    )

    confidence = _calc_confidence(
        finding,
        host_alive,
        port_reachable,
        service_confirmed,
        version_confirmed,
        auth_required,
        prerequisites_met,
        exploitation_possible,
        likely_fp,
    )

    validated = exploitation_possible and confidence >= 75 and not likely_fp

    return ValidationResult(
        validated=validated,
        confidence=confidence,
        reasoning=reasoning,
        host_alive=host_alive,
        port_reachable=port_reachable,
        service_confirmed=service_confirmed,
        version_confirmed=version_confirmed,
        auth_required=auth_required,
        prerequisites_met=prerequisites_met,
        exploitation_possible=exploitation_possible,
        likely_false_positive=likely_fp and not validated,
    )


def _context(finding: CorrelatedFinding) -> str:
    parts = [
        finding.finding,
        finding.service,
        finding.version,
        " ".join(finding.evidence),
        " ".join(f.evidence for f in finding.raw_findings),
    ]
    return " ".join(parts).lower()


def _version_in_evidence(finding: CorrelatedFinding) -> bool:
    for ev in finding.evidence:
        if re.search(r"\d+\.\d+", ev):
            return True
    return False


def _auth_required(text: str) -> bool:
    if any(m in text for m in PUBLIC_MARKERS):
        return False
    return any(m in text for m in AUTH_MARKERS)


def _prerequisites_met(finding: CorrelatedFinding, text: str) -> bool:
    if "apache" in text or "httpd" in text:
        version = finding.version.lower()
        if VULN_APACHE_2449.search(version) or VULN_APACHE_2459.search(version):
            return True
        if "cve-2021-41773" in text or "cve-2021-42013" in text:
            return "nmap" in finding.sources
    if "jenkins" in text:
        return not _auth_required(text)
    if len(finding.sources) >= 2 and not _auth_required(text):
        return True
    return len(finding.sources) >= 3


def _calc_confidence(
    finding: CorrelatedFinding,
    host_alive: bool,
    port_reachable: bool,
    service_confirmed: bool,
    version_confirmed: bool,
    auth_required: bool,
    prerequisites_met: bool,
    exploitation_possible: bool,
    likely_fp: bool,
) -> int:
    score = finding.confidence
    if host_alive:
        score += 5
    if port_reachable:
        score += 5
    if service_confirmed:
        score += 8
    if version_confirmed:
        score += 10
    if prerequisites_met:
        score += 12
    if exploitation_possible:
        score += 10
    if auth_required:
        score -= 20
    if likely_fp:
        score -= 15
    return max(5, min(99, score))
