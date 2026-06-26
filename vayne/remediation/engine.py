"""Remediation timeline — derived from evidence strings only."""

from __future__ import annotations

from vayne.models import UNKNOWN, Classification, CorrelatedFinding, RemediationTimeline, ValidationResult


def generate_timeline(
    finding: CorrelatedFinding, validation: ValidationResult
) -> RemediationTimeline:
    evidence = [e for e in finding.evidence if e.strip()]
    text = " ".join(evidence).lower()

    if validation.classification == Classification.FALSE_POSITIVE:
        return RemediationTimeline(
            immediate=["Mark as false positive using validation evidence"],
            hours_24=["Tune scanner rule that produced the signal"],
            hours_72=["Record exception with asset owner"],
            week_1=["Re-evaluate detection on next scan cycle"],
            long_term=["Maintain false-positive feedback loop"],
        )

    if not evidence:
        return RemediationTimeline(
            immediate=[UNKNOWN],
            hours_24=[UNKNOWN],
            hours_72=[UNKNOWN],
            week_1=[UNKNOWN],
            long_term=[UNKNOWN],
        )

    immediate: list[str] = []
    h24: list[str] = []
    h72: list[str] = []
    w1: list[str] = []
    long_term: list[str] = []

    if "public" in text and "s3" in text:
        immediate.append("Block public access on evidenced S3 bucket")
        h24.append("Audit bucket ACLs and policies cited in scan evidence")
        h72.append("Review IAM roles referenced in findings")
    if "iam" in text or "credential" in text or "secret" in text:
        immediate.append("Revoke and rotate credentials mentioned in evidence")
        h24.append("Scope blast radius of exposed identity")
        w1.append("Apply least-privilege IAM policies")
    if "apache" in text or finding.cve:
        immediate.append("Patch or isolate service version confirmed in evidence")
        h24.append("Re-scan to verify version after patch")
        h72.append("Review mod_proxy and path normalization if applicable")
    if "jenkins" in text:
        immediate.append("Enforce authentication on exposed management interface")
        h24.append("Restrict network access to CI/CD plane")

    if not immediate:
        immediate.append("Contain asset and reduce exposure per scan evidence")
    if not h24:
        h24.append("Validate remediation with targeted re-scan")
    if not h72:
        h72.append("Review adjacent assets on same host")
    if not w1:
        w1.append("Track fix through vulnerability management SLA")
    if not long_term:
        long_term.append("Integrate continuous validation into security program")

    return RemediationTimeline(
        immediate=immediate[:3],
        hours_24=h24[:3],
        hours_72=h72[:3],
        week_1=w1[:3],
        long_term=long_term[:3],
    )
