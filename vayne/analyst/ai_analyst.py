"""AI security analyst narrative generation."""

from __future__ import annotations

from vayne.models.schemas import (
    AnalystReport,
    Classification,
    CorrelatedFinding,
    ExploitabilityScore,
    ValidationResult,
)


def analyze(
    finding: CorrelatedFinding,
    validation: ValidationResult,
    classification: Classification,
    score: ExploitabilityScore,
) -> AnalystReport:
    why_matters = _why_matters(finding, score)
    why_validated = _why_validated(validation, classification)
    why_rejected = _why_rejected(validation, classification)
    preconditions = _preconditions(finding, validation)
    remediation = _remediation(finding, classification)

    return AnalystReport(
        why_it_matters=why_matters,
        why_validated=why_validated,
        why_rejected=why_rejected,
        attack_preconditions=preconditions,
        business_impact=score.business_impact,
        remediation_steps=remediation,
    )


def _why_matters(finding: CorrelatedFinding, score: ExploitabilityScore) -> str:
    if "apache" in finding.finding.lower() or "rce" in finding.finding.lower():
        return (
            "Unauthenticated remote code execution on an internet-facing service "
            "enables full host compromise and lateral movement."
        )
    if "jenkins" in finding.finding.lower():
        return (
            "Exposed CI/CD infrastructure can leak secrets and provide a pivot "
            "point into production environments."
        )
    return (
        f"Correlated signal from {len(finding.sources)} tools indicates "
        f"{finding.finding} with {score.business_impact} business impact."
    )


def _why_validated(validation: ValidationResult, classification: Classification) -> str:
    if classification in (Classification.CONFIRMED, Classification.LIKELY_EXPLOITABLE):
        joined = "; ".join(validation.reasoning[:4])
        return f"Validation succeeded: {joined}."
    return ""


def _why_rejected(validation: ValidationResult, classification: Classification) -> str:
    if classification != Classification.PROBABLE_FALSE_POSITIVE:
        return ""
    reasons = [r for r in validation.reasoning if "auth" in r or "failed" in r or "not met" in r]
    if not reasons:
        reasons = validation.reasoning[-2:]
    return "Likely false positive: " + "; ".join(reasons) + "."


def _preconditions(finding: CorrelatedFinding, validation: ValidationResult) -> list[str]:
    items = []
    if validation.host_alive:
        items.append("Target host must be reachable")
    if finding.port:
        items.append(f"Port {finding.port} must be accessible")
    if finding.version:
        items.append(f"Vulnerable version: {finding.version}")
    if validation.auth_required:
        items.append("Valid credentials required")
    else:
        items.append("No authentication barrier detected")
    return items


def _remediation(finding: CorrelatedFinding, classification: Classification) -> list[str]:
    if classification == Classification.PROBABLE_FALSE_POSITIVE:
        return [
            "Document as accepted risk or informational",
            "Re-scan after configuration changes",
        ]
    text = finding.finding.lower()
    if "apache" in text:
        return [
            "Upgrade Apache to the latest stable release immediately",
            "Restrict exposure behind WAF/VPN if patching is delayed",
            "Verify mod_proxy and path traversal configurations",
        ]
    if "jenkins" in text:
        return [
            "Enforce authentication on all Jenkins instances",
            "Restrict management interface to internal networks",
            "Rotate any exposed credentials",
        ]
    return [
        "Apply vendor security patches",
        "Reduce external exposure",
        "Monitor for exploitation attempts",
    ]
