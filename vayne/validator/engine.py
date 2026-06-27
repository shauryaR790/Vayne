"""Validation engine — separates observation truth from exploitability truth."""

from __future__ import annotations

import re

from vayne.attack_paths.confidence_model import FORMULA, compute_confidence
from vayne.attack_paths.graph_filters import is_inventory_finding
from vayne.models import Asset, Classification, CorrelatedFinding, ValidationResult

AUTH_MARKERS = ("login", "401", "403", "authentication", "unauthorized", "sign in")
PUBLIC_MARKERS = ("public", "unauthenticated", "anonymous", "no auth", "no authentication")
VULN_APACHE = re.compile(r"2\.4\.(4[0-9]|5[0-9])")
FINGERPRINT = re.compile(
    r"(apache|nginx|postgres|httpd|openssh|mysql)/[\d.]+", re.I
)

NOISE_TITLE_MARKERS = (
    "dns wildcard",
    "self-signed certificate",
    "content-security-policy",
    "x-frame-options",
    "httponly",
    "server header disclosure",
    "robots.txt",
    "email address in page",
    ".git/config",
    "admin panel detected",
)


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
        checks, finding, vuln_type, auth_required, prerequisites_met, cve_applicable, reproducible
    )

    classification, observation_status, exploitability_status = _classify(
        confidence,
        auth_required,
        prerequisites_met,
        reproducible,
        checks,
        finding,
        vuln_type,
    )

    if classification == Classification.OBSERVED:
        obs_conf, obs_breakdown = observation_confidence_from_checks(
            checks, finding, reproducible=reproducible
        )
        confidence = obs_conf
        breakdown = obs_breakdown

    if classification == Classification.OBSERVED:
        reasoning.append("observation confirmed — not a false positive")
    elif classification == Classification.UNCONFIRMED_EXPLOITABILITY:
        reasoning.append("observation confirmed — exploitability unverified")

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
        observation_status=observation_status,
        exploitability_status=exploitability_status,
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
    if any(fi.source_tool == "nmap" for fi in f.findings):
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
    if vuln_type not in ("iam", "s3"):
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


def _observation_confirmed(checks: dict[str, bool]) -> bool:
    return bool(
        checks.get("host_alive")
        and (
            checks.get("service_fingerprinted")
            or checks.get("port_open")
            or checks.get("service_exists")
        )
    )


def _is_noise_finding(
    finding: CorrelatedFinding,
    checks: dict[str, bool],
    confidence: int,
    auth: bool,
    prereq: bool,
) -> bool:
    if not finding.evidence:
        return True
    title = finding.title.lower()
    if any(marker in title for marker in NOISE_TITLE_MARKERS):
        return True
    if auth and not prereq and confidence < 45:
        return True
    if confidence < 25 and not _observation_confirmed(checks):
        return True
    return False


def _classify(
    confidence: int,
    auth: bool,
    prereq: bool,
    repro: bool,
    checks: dict[str, bool],
    finding: CorrelatedFinding,
    vuln_type: str,
) -> tuple[Classification, str, str]:
    if _is_noise_finding(finding, checks, confidence, auth, prereq):
        return Classification.FALSE_POSITIVE, "rejected", "rejected"

    obs_confirmed = _observation_confirmed(checks)
    obs_status = "confirmed" if obs_confirmed else "uncertain"

    if is_inventory_finding(finding) and obs_confirmed:
        return Classification.OBSERVED, obs_status, "not_applicable"

    critical_passed = sum(
        1 for k in ("reachable", "prerequisites_met", "service_exists") if checks.get(k)
    )

    if checks.get("cve_applicable") and prereq and repro and confidence >= 80 and critical_passed >= 3:
        return Classification.CONFIRMED, obs_status, "confirmed"

    if confidence >= 50 and prereq and checks.get("reachable"):
        return Classification.LIKELY_EXPLOITABLE, obs_status, "likely"

    if finding.cve and not checks.get("cve_applicable"):
        return (
            Classification.UNCONFIRMED_EXPLOITABILITY,
            obs_status,
            "unconfirmed",
        )

    if vuln_type in ("cve", "s3", "iam", "credential") and obs_confirmed:
        if not prereq or not checks.get("cve_applicable"):
            return (
                Classification.UNCONFIRMED_EXPLOITABILITY,
                obs_status,
                "unconfirmed",
            )

    if obs_confirmed and checks.get("service_fingerprinted"):
        return Classification.OBSERVED, obs_status, "not_applicable"

    if obs_confirmed and checks.get("version_matches"):
        return Classification.OBSERVED, obs_status, "not_applicable"

    if obs_confirmed:
        return Classification.OBSERVED, obs_status, "not_applicable"

    if confidence < 50:
        return Classification.MANUAL_REVIEW, obs_status, "unconfirmed"

    return Classification.MANUAL_REVIEW, obs_status, "unconfirmed"


def _confidence_from_checks(
    checks: dict[str, bool],
    finding: CorrelatedFinding,
    vuln_type: str,
    auth_required: bool,
    prerequisites_met: bool,
    cve_applicable: bool,
    reproducible: bool,
) -> tuple[int, list[str]]:
    if not finding.evidence:
        return 0, []

    primary_tool = finding.sources[0] if finding.sources else "scan"
    maturity = "functional" if cve_applicable else "unknown"
    if vuln_type == "s3" and checks.get("prerequisites_met"):
        maturity = "poc"

    confidence, breakdown = compute_confidence(
        source_tool=primary_tool,
        source_count=len(finding.sources),
        exploit_maturity=maturity,
        version_match_only=bool(finding.cve) and not cve_applicable,
        prerequisites_met=prerequisites_met,
        cve_verified=cve_applicable,
        candidate_only=bool(finding.cve) and not cve_applicable,
        host_alive=checks.get("host_alive", False),
        port_open=checks.get("port_open", False),
        reachable=checks.get("reachable", False),
        reproducible=reproducible,
        fingerprinted=checks.get("service_fingerprinted", False),
    )
    breakdown = [FORMULA] + breakdown
    return confidence, breakdown


def observation_confidence_from_checks(
    checks: dict[str, bool],
    finding: CorrelatedFinding,
    *,
    reproducible: bool,
) -> tuple[int, list[str]]:
    from vayne.attack_paths.confidence_model import compute_observation_confidence

    confidence, breakdown = compute_observation_confidence(
        service_fingerprinted=checks.get("service_fingerprinted", False),
        version_matches=checks.get("version_matches", False),
        port_open=checks.get("port_open", False),
        host_alive=checks.get("host_alive", False),
        source_count=len(finding.sources),
        reproducible=reproducible,
    )
    return confidence, breakdown


def format_analyst_status(validation: ValidationResult) -> str:
    """Human-readable status for analyst UI."""
    if validation.classification == Classification.FALSE_POSITIVE:
        return "FALSE POSITIVE"
    if validation.classification == Classification.OBSERVED:
        return "OBSERVED · exploitability not assessed"
    if validation.classification == Classification.UNCONFIRMED_EXPLOITABILITY:
        return "OBSERVED · UNCONFIRMED EXPLOITABILITY"
    if validation.classification == Classification.CONFIRMED:
        return "CONFIRMED · exploitability verified"
    if validation.classification == Classification.LIKELY_EXPLOITABLE:
        return "OBSERVED · LIKELY EXPLOITABLE"
    return validation.classification.value
