"""Remediation timeline engine."""

from __future__ import annotations

from vayne.models import Classification, CorrelatedFinding, RemediationTimeline, ValidationResult


def generate_timeline(
    finding: CorrelatedFinding, validation: ValidationResult
) -> RemediationTimeline:
    text = f"{finding.title} {' '.join(finding.tags)}".lower()

    if validation.classification == Classification.FALSE_POSITIVE:
        return RemediationTimeline(
            immediate=["Mark finding as false positive in ticketing system"],
            hours_24=["Tune scanner template to reduce noise"],
            hours_72=["Document exception with business owner"],
            week_1=["Review detection rule quarterly"],
            long_term=["Maintain scanner hygiene program"],
        )

    if "s3" in text:
        return RemediationTimeline(
            immediate=["Block public access on affected S3 bucket"],
            hours_24=["Rotate all IAM keys with bucket access"],
            hours_72=["Audit bucket policies and ACLs across account"],
            week_1=["Rebuild trust policies with least privilege"],
            long_term=["Implement continuous cloud posture monitoring"],
        )

    if "apache" in text:
        return RemediationTimeline(
            immediate=["Isolate affected edge nodes from production traffic"],
            hours_24=["Patch Apache to non-vulnerable release"],
            hours_72=["Validate mod_proxy and path normalization configs"],
            week_1=["Deploy WAF rules for traversal patterns"],
            long_term=["Automate patch compliance for internet-facing services"],
        )

    if "github" in text or "secret" in text:
        return RemediationTimeline(
            immediate=["Revoke exposed credentials and tokens"],
            hours_24=["Scan entire org for additional secret leaks"],
            hours_72=["Enable secret scanning and pre-commit hooks"],
            week_1=["Rotate all production secrets"],
            long_term=["Implement vault-based secret management"],
        )

    if "jenkins" in text:
        return RemediationTimeline(
            immediate=["Require authentication on Jenkins UI"],
            hours_24=["Restrict management port to internal network"],
            hours_72=["Audit build pipeline permissions"],
            week_1=["Enable MFA for administrative accounts"],
            long_term=["Move CI/CD to hardened private infrastructure"],
        )

    return RemediationTimeline(
        immediate=["Contain affected asset and reduce exposure"],
        hours_24=["Apply vendor security patch"],
        hours_72=["Validate fix with targeted re-scan"],
        week_1=["Review adjacent assets for same weakness"],
        long_term=["Integrate finding into vulnerability management SLA"],
    )
