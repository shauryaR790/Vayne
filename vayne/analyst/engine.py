"""Evidence-only analyst brief generation."""

from __future__ import annotations

from vayne.models import (
    UNKNOWN,
    AnalystBrief,
    AttackPath,
    Classification,
    CorrelatedFinding,
    ValidationResult,
)
from vayne.exploitability.scorer import attacker_effort_label, score_exploitability


def generate_brief(
    finding: CorrelatedFinding,
    validation: ValidationResult,
    attack_paths: list[AttackPath],
) -> AnalystBrief:
    evidence = [e for e in finding.evidence if e.strip()]
    score = score_exploitability(finding, validation)
    effort = attacker_effort_label(finding, validation, attack_paths)

    root = _root_from_evidence(evidence)
    impact = _impact_from_evidence(evidence, validation)
    scenario = _scenario_from_paths(attack_paths)
    prereqs = _prerequisites(validation, finding)
    why = _why_matters(impact, validation, evidence)
    actions = _actions_from_evidence(evidence, validation, attack_paths)
    remediation = _remediation_from_evidence(evidence, validation)

    exploit_label = f"{score}/10"
    if effort:
        exploit_label += f" — attacker effort: {effort}"
    elif validation.classification in (
        Classification.OBSERVED,
        Classification.UNCONFIRMED_EXPLOITABILITY,
    ):
        exploit_label += " — unconfirmed"
    elif validation.classification == Classification.FALSE_POSITIVE:
        exploit_label += " — unlikely"
    else:
        exploit_label += f" — {UNKNOWN}"

    return AnalystBrief(
        root_cause=root,
        impact_assessment=impact,
        attack_scenario=scenario,
        exploitability=exploit_label,
        prerequisites=prereqs,
        evidence=evidence[:6],
        why_this_matters=why,
        confidence=validation.confidence,
        likely_attacker_actions=actions,
        remediation_summary=remediation,
    )


def _root_from_evidence(evidence: list[str]) -> str:
    if not evidence:
        return UNKNOWN
    return evidence[0][:280]


def _impact_from_evidence(evidence: list[str], validation: ValidationResult) -> str:
    if validation.classification == Classification.FALSE_POSITIVE:
        return "Likely false positive per validation checks."
    if validation.classification == Classification.OBSERVED:
        return (
            "Confirmed scan observation — service or asset exists in evidence. "
            "Exploitability not assessed."
        )
    if validation.classification == Classification.UNCONFIRMED_EXPLOITABILITY:
        return (
            "Observation confirmed in scan output. "
            "Exploit prerequisites or CVE applicability not verified."
        )
    if not evidence:
        return UNKNOWN
    if validation.reachable and validation.prerequisites_met:
        return (
            f"Reachable weakness with prerequisites met "
            f"({len(validation.reasoning)} validation signals)."
        )
    if validation.cve_applicable and evidence:
        return f"CVE applicability confirmed with scan evidence: {evidence[0][:160]}"
    return UNKNOWN


def _scenario_from_paths(paths: list[AttackPath]) -> str:
    if not paths:
        return UNKNOWN
    p = paths[0]
    chain = " → ".join(n.label for n in p.nodes)
    edge_ev = [e.evidence for e in p.edges if e.evidence][:2]
    detail = f" Evidence: {'; '.join(edge_ev)}" if edge_ev else ""
    if p.termination_message:
        return f"{chain}. {p.termination_message}{detail}"
    return f"{chain}.{detail}"


def _prerequisites(validation: ValidationResult, finding: CorrelatedFinding) -> list[str]:
    items = []
    for check, label in [
        (validation.host_alive, "Target host reachable"),
        (validation.port_open, "Open port confirmed"),
        (validation.service_exists, "Service confirmed"),
        (validation.version_matches, "Version confirmed"),
        (validation.cve_applicable, "CVE applicable to version"),
        (validation.auth_required, "Authentication required"),
        (validation.prerequisites_met, "Exploit prerequisites met"),
        (validation.reachable, "Attack surface reachable"),
    ]:
        if check:
            items.append(label)
    if finding.cve and not validation.cve_applicable:
        items.append(f"CVE {finding.cve} — applicability unconfirmed")
    return items or [UNKNOWN]


def _why_matters(impact: str, validation: ValidationResult, evidence: list[str]) -> str:
    if validation.classification == Classification.FALSE_POSITIVE:
        return "Automated triage reduced analyst noise."
    if impact == UNKNOWN and not evidence:
        return UNKNOWN
    return (
        f"{impact} Based on {len(validation.reasoning)} validation check(s) "
        f"and {len(evidence)} evidence item(s)."
    )


def _actions_from_evidence(
    evidence: list[str],
    validation: ValidationResult,
    attack_paths: list[AttackPath],
) -> list[str]:
    if validation.classification == Classification.FALSE_POSITIVE:
        return ["No viable exploitation path identified"]
    if not evidence:
        return [UNKNOWN]
    actions = []
    text = " ".join(evidence).lower()
    if validation.reachable:
        actions.append("Reach externally accessible surface")
    if "write" in text or "upload" in text:
        actions.append("Abuse write access evidenced in scan")
    if "credential" in text or "secret" in text or "iam" in text:
        actions.append("Leverage exposed credentials or IAM scope from evidence")
    if attack_paths and attack_paths[0].missing_evidence:
        actions.append(
            f"Path blocked — requires: {attack_paths[0].missing_evidence[0]}"
        )
    if not actions:
        actions.append("Validate finding manually — insufficient action evidence")
    return actions[:5]


def _remediation_from_evidence(evidence: list[str], validation: ValidationResult) -> str:
    if validation.classification == Classification.FALSE_POSITIVE:
        return "Document false positive; tune detection rules per evidence."
    if not evidence:
        return UNKNOWN
    text = " ".join(evidence).lower()
    steps = []
    if "public" in text and "s3" in text:
        steps.append("remove public S3 access")
    if "iam" in text or "credential" in text:
        steps.append("rotate credentials and restrict IAM policies")
    if "apache" in text or "cve" in text:
        steps.append("patch affected service version")
    if not steps:
        return UNKNOWN
    return "Immediate: " + "; ".join(steps) + "."
