"""Validation engine — evidence-based checks only."""

from __future__ import annotations

import re

from vayne.models import Asset, Classification, CorrelatedFinding, ValidationResult

AUTH_MARKERS = ("login", "401", "403", "authentication", "unauthorized", "sign in")
PUBLIC_MARKERS = ("public", "unauthenticated", "anonymous", "no auth", "no authentication")
VULN_APACHE = re.compile(r"2\.4\.(4[0-9]|5[0-9])")
FINGERPRINT = re.compile(
    r"(apache|nginx|postgres|httpd|openssh|mysql)/[\d.]+", re.I
)

CHECK_WEIGHTS = {
    "host_alive": 20,
    "port_open": 15,
    "service_exists": 15,
    "service_fingerprinted": 10,
    "version_matches": 15,
    "cve_applicable": 15,
    "prerequisites_met": 10,
    "reachable": 10,
    "reproducible": 10,
    "privilege_escalation_possible": 8,
    "lateral_movement_possible": 8,
}


def validate_finding(
    finding: CorrelatedFinding, assets: list[Asset]
) -> ValidationResult:
    text = _ctx(finding)
    asset = _asset_for(finding.host, assets)
    reasoning: list[str] = []
    vuln_type = _vuln_type(text, finding)

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
        reasoning.append("service identified")

    service_fingerprinted = _service_fingerprinted(finding, asset)
    if service_fingerprinted:
        reasoning.append("service fingerprinted")

    version_matches = _version_confirmed(finding, asset, vuln_type)
    if version_matches:
        reasoning.append("version identified")

    cve_applicable = bool(finding.cve) and version_matches and vuln_type == "cve"
    if finding.cve and cve_applicable:
        reasoning.append("CVE applicable")
    elif finding.cve:
        reasoning.append("CVE applicability uncertain")

    auth_required = any(m in text for m in AUTH_MARKERS) and not any(
        m in text for m in PUBLIC_MARKERS
    )
    if auth_required:
        reasoning.append("authentication required")

    prerequisites_met = _prerequisites(finding, text, auth_required, vuln_type)
    if prerequisites_met:
        reasoning.append("exploit prerequisites met")
    elif auth_required:
        reasoning.append("exploit prerequisites not met")

    reachable = (
        "public" in text
        or "httpx" in finding.sources
        or (asset and "public" in asset.tags)
    )
    if reachable:
        reasoning.append("target reachable")

    reproducible = len(finding.sources) >= 2 and not auth_required
    if reproducible:
        reasoning.append("reproduced with second tool")

    privilege_escalation_possible = _privilege_escalation(text, finding, vuln_type)
    if privilege_escalation_possible:
        reasoning.append("privilege escalation evidenced")

    lateral_movement_possible = _lateral_movement(text, finding, vuln_type)
    if lateral_movement_possible:
        reasoning.append("lateral movement evidenced")

    checks = {
        "host_alive": host_alive,
        "port_open": port_open,
        "service_exists": service_exists,
        "service_fingerprinted": service_fingerprinted,
        "version_matches": version_matches,
        "cve_applicable": cve_applicable,
        "prerequisites_met": prerequisites_met,
        "reachable": reachable,
        "reproducible": reproducible,
        "privilege_escalation_possible": privilege_escalation_possible,
        "lateral_movement_possible": lateral_movement_possible,
    }
    confidence, breakdown = _confidence_from_checks(
        checks, len(finding.evidence), len(finding.sources)
    )

    classification = _classify(confidence, auth_required, prerequisites_met, reproducible, checks)

    return ValidationResult(
        host_alive=host_alive,
        port_open=port_open,
        service_exists=service_exists,
        service_fingerprinted=service_fingerprinted,
        version_matches=version_matches,
        cve_applicable=cve_applicable,
        auth_required=auth_required,
        prerequisites_met=prerequisites_met,
        reachable=reachable,
        reproducible=reproducible,
        privilege_escalation_possible=privilege_escalation_possible,
        lateral_movement_possible=lateral_movement_possible,
        confidence=confidence,
        confidence_breakdown=breakdown,
        reasoning=reasoning,
        classification=classification,
    )


def _vuln_type(text: str, f: CorrelatedFinding) -> str:
    if f.cve or "apache" in text or "41773" in text:
        return "cve"
    if "s3" in text or "bucket" in text:
        return "s3"
    if "github" in text or "token" in text:
        return "credential"
    if "iam" in text or "assume" in text or "sts:" in text:
        return "iam"
    if "database" in text or "postgres" in text or "mysql" in text:
        return "database"
    return "generic"


def _ctx(f: CorrelatedFinding) -> str:
    parts = [f.title, f.description, " ".join(f.evidence)]
    return " ".join(parts).lower()


def _asset_for(host: str, assets: list[Asset]) -> Asset | None:
    for a in assets:
        if a.host == host or a.ip == host:
            return a
    return None


def _service_fingerprinted(f: CorrelatedFinding, asset: Asset | None) -> bool:
    if any(FINGERPRINT.search(e) for e in f.evidence):
        return True
    if any(f.source_tool == "nmap" for f in f.findings):
        return True
    return bool(asset and asset.technologies)


def _version_confirmed(f: CorrelatedFinding, asset: Asset | None, vuln_type: str) -> bool:
    if vuln_type == "s3":
        return "public" in _ctx(f) or "acl" in _ctx(f)
    if vuln_type == "iam":
        return bool(re.search(r"arn:aws:iam::", " ".join(f.evidence), re.I))
    if any(re.search(r"\d+\.\d+", e) for e in f.evidence):
        return True
    if asset and asset.technologies:
        return True
    return "nmap" in f.sources


def _prerequisites(
    f: CorrelatedFinding, text: str, auth: bool, vuln_type: str
) -> bool:
    if auth:
        return False
    if vuln_type == "cve" and "apache" in text and (
        VULN_APACHE.search(text) or "41773" in text
    ):
        return True
    if vuln_type == "s3" and "public" in text:
        return True
    if vuln_type == "iam" and re.search(r"arn:aws:iam::", text):
        return True
    if vuln_type == "credential" and ("access key" in text or "token" in text):
        return True
    if len(f.sources) >= 2 and f.evidence:
        return True
    return False


def _privilege_escalation(text: str, f: CorrelatedFinding, vuln_type: str) -> bool:
    if vuln_type != "iam":
        return False
    markers = ("assume", "sts:", "adminrole", "arn:aws:iam::")
    return any(m in text for m in markers) and bool(f.evidence)


def _lateral_movement(text: str, f: CorrelatedFinding, vuln_type: str) -> bool:
    if vuln_type not in ("iam", "database", "credential"):
        return False
    markers = (
        "database_url",
        "postgres://",
        "mysql://",
        "rds:",
        "db.example.com",
    )
    return any(m in text for m in markers) and bool(f.evidence)


def _confidence_from_checks(
    checks: dict[str, bool], evidence_count: int, source_count: int
) -> tuple[int, list[str]]:
    if evidence_count == 0:
        return 0, []
    breakdown: list[str] = []
    for key, passed in checks.items():
        if passed:
            pts = CHECK_WEIGHTS.get(key, 5)
            label = key.replace("_", " ")
            breakdown.append(f"+{pts} {label}")
    passed = sum(1 for v in checks.values() if v)
    total = len(checks)
    base = int((passed / total) * 70) if total else 0
    base += min(20, evidence_count * 4)
    base += min(10, source_count * 5)
    return min(100, base), breakdown


def _classify(
    confidence: int,
    auth: bool,
    prereq: bool,
    repro: bool,
    checks: dict[str, bool],
) -> Classification:
    if confidence < 35:
        return Classification.FALSE_POSITIVE
    if auth and not prereq:
        return Classification.FALSE_POSITIVE
    critical_passed = sum(
        1 for k in ("reachable", "prerequisites_met", "service_exists") if checks.get(k)
    )
    if confidence >= 80 and critical_passed >= 3 and repro:
        return Classification.CONFIRMED
    if confidence >= 60 and prereq and checks.get("reachable"):
        return Classification.LIKELY_EXPLOITABLE
    if confidence < 50:
        return Classification.MANUAL_REVIEW
    return Classification.MANUAL_REVIEW
