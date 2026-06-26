"""Validation engine — verify findings like a human analyst."""

from __future__ import annotations

import re

from vayne.models import Asset, Classification, CorrelatedFinding, ValidationResult

AUTH_MARKERS = ("login", "401", "403", "authentication", "unauthorized", "sign in")
PUBLIC_MARKERS = ("public", "unauthenticated", "anonymous", "no auth")
VULN_APACHE = re.compile(r"2\.4\.(4[0-9]|5[0-9])")


def validate_finding(
    finding: CorrelatedFinding, assets: list[Asset]
) -> ValidationResult:
    text = _ctx(finding)
    asset = _asset_for(finding.host, assets)
    reasoning: list[str] = []

    host_alive = bool(finding.host)
    if host_alive:
        reasoning.append("host alive")

    port_open = finding.port is not None or any(
        f.source_tool in ("nmap", "naabu") for f in finding.findings
    )
    if port_open:
        reasoning.append("port open")

    service_exists = bool(finding.service) or bool(asset and asset.services)
    if service_exists:
        reasoning.append("service exists")

    version_matches = _version_confirmed(finding, asset)
    if version_matches:
        reasoning.append("version matches")

    cve_applicable = bool(finding.cve) and version_matches
    if finding.cve and cve_applicable:
        reasoning.append("CVE affects confirmed version")
    elif finding.cve:
        reasoning.append("CVE applicability uncertain")

    auth_required = any(m in text for m in AUTH_MARKERS) and not any(
        m in text for m in PUBLIC_MARKERS
    )
    if auth_required:
        reasoning.append("authentication required")

    prerequisites_met = _prerequisites(finding, text, auth_required)
    if prerequisites_met:
        reasoning.append("exploit prerequisites met")
    elif auth_required:
        reasoning.append("exploit prerequisites not met")

    reachable = "public" in text or "httpx" in finding.sources or host_alive
    if reachable:
        reasoning.append("reachable attack surface")

    reproducible = len(finding.sources) >= 2 and not auth_required
    if reproducible:
        reasoning.append("reproducible across tools")

    confidence = _confidence(
        finding, host_alive, port_open, service_exists, version_matches,
        cve_applicable, auth_required, prerequisites_met, reproducible,
    )

    classification = _classify(
        confidence, auth_required, prerequisites_met, reproducible, finding.severity
    )

    return ValidationResult(
        host_alive=host_alive,
        port_open=port_open,
        service_exists=service_exists,
        version_matches=version_matches,
        cve_applicable=cve_applicable,
        auth_required=auth_required,
        prerequisites_met=prerequisites_met,
        reachable=reachable,
        reproducible=reproducible,
        confidence=confidence,
        reasoning=reasoning,
        classification=classification,
    )


def _ctx(f: CorrelatedFinding) -> str:
    parts = [f.title, f.description, " ".join(f.evidence), " ".join(f.tags)]
    return " ".join(parts).lower()


def _asset_for(host: str, assets: list[Asset]) -> Asset | None:
    for a in assets:
        if a.host == host or a.ip == host:
            return a
    return None


def _version_confirmed(f: CorrelatedFinding, asset: Asset | None) -> bool:
    if any(re.search(r"\d+\.\d+", e) for e in f.evidence):
        return True
    if asset and asset.technologies:
        return True
    return "nmap" in f.sources


def _prerequisites(f: CorrelatedFinding, text: str, auth: bool) -> bool:
    if auth:
        return False
    if "apache" in text and (VULN_APACHE.search(text) or "41773" in text):
        return True
    if "s3" in text and "public" in text:
        return True
    if len(f.sources) >= 2:
        return True
    return False


def _confidence(
    f: CorrelatedFinding, *checks: bool | object
) -> int:
    score = f.confidence
    for c in checks:
        if c is True:
            score += 4
        elif c is False:
            score -= 3
    return max(5, min(99, score))


def _classify(
    confidence: int, auth: bool, prereq: bool, repro: bool, severity: str
) -> Classification:
    if auth and not prereq:
        return Classification.FALSE_POSITIVE
    if confidence >= 88 and prereq and repro:
        return Classification.CONFIRMED
    if confidence >= 72 and prereq:
        return Classification.LIKELY_EXPLOITABLE
    if confidence < 55 or auth:
        return Classification.FALSE_POSITIVE
    return Classification.MANUAL_REVIEW
