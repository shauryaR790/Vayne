"""Analyst Reasoning (Priority 11).

Replaces terse machine checklists ("Host alive", "Version found") with the kind
of prose a senior analyst writes in a notebook — each line grounded in the
evidence, the evidence *quality*, the canonical correlation, and the gap between
observation and exploit confidence. Fully deterministic.
"""

from __future__ import annotations

from typing import Any

from vayne.evidence.quality import AggregateQuality
from vayne.models import CorrelatedFinding, ValidationResult
from vayne.service_intel.profiles import ServiceProfile


def build_reasoning(
    finding: CorrelatedFinding,
    validation: ValidationResult,
    profile: ServiceProfile,
    quality: AggregateQuality,
    conflicts: list[dict[str, Any]] | None = None,
) -> list[str]:
    conflicts = conflicts or []
    entity = finding.canonical_entity
    product = (entity.product if entity else "") or finding.title
    version = entity.version if entity else ""
    lines: list[str] = []

    # 1) What was identified and from what quality of evidence.
    if quality.items:
        best = max(quality.items, key=lambda q: q.reliability)
        src = best.source_tool or "a scanner"
        if version:
            lines.append(
                f"{product} version {version} was identified from a "
                f"{best.reliability_tier.lower()}-reliability {_type(best.evidence_type)} via {src}."
            )
        else:
            lines.append(
                f"{product} was identified from a {best.reliability_tier.lower()}-reliability "
                f"{_type(best.evidence_type)} via {src}, but no exact version was parsed."
            )

    # 2) Cross-scanner corroboration.
    agr = finding.scanner_agreement
    if agr and len(agr.agreed) >= 2:
        lines.append(
            f"Independent scanners corroborate the finding ({agr.label} capable detectors agree), "
            f"which strengthens the observation beyond a single source."
        )
    elif agr and len(agr.capable) > 1:
        lines.append(
            f"Only {len(agr.agreed)} of {len(agr.capable)} capable scanners reported this; "
            f"corroboration is limited and additional coverage would raise certainty."
        )

    # 3) Version / banner consistency.
    if validation.version_matches:
        lines.append("The service fingerprint agrees with the reported version.")
    elif version:
        lines.append("The version comes from a banner and has not been independently replayed.")

    # 4) Reachability / exposure.
    if validation.reachable:
        lines.append("The service is reachable from the internet-facing entry point.")
    elif validation.port_open:
        lines.append("The port is open but internet reachability was not established.")

    # 5) Conflicts surfaced.
    for c in conflicts[:2]:
        lines.append(
            f"A {c.get('kind')} contradiction was detected ({c.get('detail')}); "
            f"confidence was reduced by {abs(int(c.get('confidence_impact') or 0))}% and "
            f"{c.get('suggested_action', '').lower()} would resolve it."
        )

    # 6) Exploit posture.
    if str(validation.exploitability_status) == "confirmed" or validation.reproducible:
        lines.append("Exploitability is confirmed by a reproduced result.")
    elif validation.cve_applicable and finding.cve:
        lines.append(
            f"{finding.cve} is applicable to the observed version, but exploitation has not been replayed."
        )
    else:
        lines.append("Replay has not yet confirmed exploitability; no authenticated verification exists.")

    # 7) The senior-analyst conclusion balancing the dimensions.
    obs = validation.observation_confidence
    exp = validation.exploit_confidence
    lines.append(
        f"Observation confidence is {_band(obs)} ({obs}%) while exploit confidence is "
        f"{_band(exp)} ({exp}%); the existence of the service is well supported, and the "
        f"open question is whether it can be exploited in this environment."
    )

    # 8) Service-specific lens.
    if profile.typical_attack_surface:
        lines.append(
            f"For {profile.display}, the attack surface to probe next is: "
            f"{', '.join(profile.typical_attack_surface[:3])}."
        )

    return lines


def _type(evidence_type: str) -> str:
    return evidence_type.replace("_", " ")


def _band(score: int) -> str:
    if score >= 80:
        return "high"
    if score >= 55:
        return "moderate"
    if score >= 30:
        return "low"
    return "very low"
