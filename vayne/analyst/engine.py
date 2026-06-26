"""AI analyst narrative generation."""

from __future__ import annotations

from vayne.models import AnalystBrief, AttackPath, Classification, CorrelatedFinding, ValidationResult
from vayne.exploitability.scorer import exploit_time_label, score_exploitability


def generate_brief(
    finding: CorrelatedFinding,
    validation: ValidationResult,
    attack_paths: list[AttackPath],
) -> AnalystBrief:
    score = score_exploitability(finding, validation)
    text = f"{finding.title} {finding.description} {' '.join(finding.tags)}".lower()

    root = _root_cause(text, finding)
    impact = _business_impact(text, finding, validation)
    scenario = _attack_scenario(text, finding, attack_paths)
    prereqs = _prerequisites(validation, finding)
    why = _why_matters(impact, validation)
    actions = _attacker_actions(text, validation)
    remediation = _remediation_summary(text, validation)

    return AnalystBrief(
        root_cause=root,
        business_impact=impact,
        attack_scenario=scenario,
        exploitability=f"{score}/10 — {exploit_time_label(score, validation.classification)}",
        prerequisites=prereqs,
        why_this_matters=why,
        confidence=validation.confidence,
        likely_attacker_actions=actions,
        remediation_summary=remediation,
    )


def _root_cause(text: str, f: CorrelatedFinding) -> str:
    if "s3" in text:
        return "Public S3 write access enabled on production bucket."
    if "apache" in text:
        return "Unpatched Apache version with known path traversal/RCE CVE."
    if "jenkins" in text:
        return "Jenkins management interface exposed without adequate access controls."
    if "github" in text and "secret" in text:
        return "Hardcoded credentials committed to public or accessible repository."
    if "iam" in text:
        return "Over-privileged IAM role with excessive trust policy scope."
    return f"Correlated weakness across {len(f.sources)} tools: {f.title}."


def _business_impact(text: str, f: CorrelatedFinding, v: ValidationResult) -> str:
    if v.classification == Classification.FALSE_POSITIVE:
        return "Low — likely non-exploitable in current configuration."
    if "rce" in text or "apache" in text:
        return "Critical — remote code execution on internet-facing infrastructure."
    if "s3" in text or "production" in text:
        return "Critical — potential production compromise and data exfiltration."
    if f.severity.lower() in ("critical", "high"):
        return "High — meaningful risk to confidentiality, integrity, or availability."
    return "Medium — requires contextual business review."


def _attack_scenario(
    text: str, f: CorrelatedFinding, paths: list[AttackPath]
) -> str:
    if paths:
        p = paths[0]
        steps = " → ".join(n.label for n in p.nodes)
        return f"Attacker chains {steps}. {p.blast_radius}"
    if "apache" in text:
        return (
            "Attacker sends crafted path traversal request, achieves RCE, "
            "establishes persistence on edge node."
        )
    if "jenkins" in text:
        return (
            "Attacker probes Jenkins UI, attempts credential brute force or "
            "exploit of exposed build pipeline."
        )
    return f"Attacker targets {f.host} via {f.service or 'exposed service'}."


def _prerequisites(v: ValidationResult, f: CorrelatedFinding) -> list[str]:
    items = []
    if v.host_alive:
        items.append("Target host reachable")
    if f.port:
        items.append(f"Port {f.port} accessible")
    if v.auth_required:
        items.append("Valid credentials required")
    else:
        items.append("No authentication barrier detected")
    if f.cve:
        items.append(f"Vulnerability: {f.cve}")
    return items


def _why_matters(impact: str, v: ValidationResult) -> str:
    if v.classification == Classification.FALSE_POSITIVE:
        return "Noise reduction — analyst time saved by automated triage."
    return f"{impact} Validated across multiple independent signals."


def _attacker_actions(text: str, v: ValidationResult) -> list[str]:
    if v.classification == Classification.FALSE_POSITIVE:
        return ["Automated scanner probe only", "No viable exploitation path"]
    actions = ["Reconnaissance and fingerprinting", "Vulnerability validation"]
    if "s3" in text:
        actions.extend(["Upload malicious object", "Harvest IAM credentials from bucket"])
    if "apache" in text:
        actions.extend(["Deploy web shell", "Pivot to internal network"])
    if "github" in text:
        actions.extend(["Extract secrets from repo", "Use cloud API keys"])
    actions.append("Establish persistence or exfiltrate data")
    return actions[:5]


def _remediation_summary(text: str, v: ValidationResult) -> str:
    if v.classification == Classification.FALSE_POSITIVE:
        return "Document as accepted risk; tune scanner rules to reduce noise."
    if "s3" in text:
        return "Close public bucket access and rotate exposed credentials immediately."
    if "apache" in text:
        return "Patch Apache to latest stable release and restrict edge exposure."
    return "Apply vendor patches, reduce exposure, and monitor for exploitation."
