"""Business Impact Engine (Priority 13).

Business impact is computed, not stated. It combines internet exposure, the
privilege required to exploit, asset criticality, blast radius, exploit
maturity, lateral-movement potential, data sensitivity, recovery difficulty and
observation confidence into a single explainable score plus a narrative that
tells the reader what an attacker gains, what is exposed, which process is
affected, and the potential consequences.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from vayne.calibration import default_calibrator
from vayne.models import AttackPath, CorrelatedFinding, ValidationResult
from vayne.service_intel.profiles import ServiceProfile


@dataclass
class _Factor:
    label: str
    delta: int

    def as_dict(self) -> dict[str, Any]:
        return {"label": self.label, "delta": int(self.delta)}


_DATA_SENSITIVITY_WEIGHT = {"critical": 22, "high": 16, "medium": 9, "low": 3, "unknown": 6}
_RECOVERY_WEIGHT = {"hard": 12, "moderate": 7, "easy": 3}


def _clamp(n: float, lo: int = 0, hi: int = 100) -> int:
    return max(lo, min(hi, int(round(n))))


def compute_business_impact(
    finding: CorrelatedFinding,
    validation: ValidationResult,
    profile: ServiceProfile,
    attack_paths: list[AttackPath] | None = None,
) -> dict[str, Any]:
    attack_paths = attack_paths or []
    model = profile.business_impact_model or {}
    factors: list[_Factor] = []

    # Internet exposure.
    internet = validation.reachable or model.get("exposure") == "internet"
    if internet:
        factors.append(_Factor("Internet-facing exposure", 18))
    else:
        factors.append(_Factor("Internal-only exposure", 6))

    # Privilege required to exploit (unauth is worse).
    if validation.auth_required:
        factors.append(_Factor("Authentication required to exploit", -8))
    else:
        factors.append(_Factor("No authentication required", 10))

    # Data sensitivity from the service model.
    sensitivity = str(model.get("data_sensitivity") or "unknown")
    factors.append(
        _Factor(f"Data sensitivity: {sensitivity}", _DATA_SENSITIVITY_WEIGHT.get(sensitivity, 6))
    )

    # Blast radius from attack paths that traverse this finding.
    blast = max(
        [int(p.blast_radius or 0) for p in attack_paths if _touches(p, finding)] or [0]
    )
    if blast >= 3:
        factors.append(_Factor(f"Large blast radius ({blast} assets)", 14))
    elif blast == 2:
        factors.append(_Factor("Moderate blast radius", 8))
    elif blast == 1:
        factors.append(_Factor("Single-asset blast radius", 3))

    # Exploit maturity / confirmation.
    if str(validation.exploitability_status) == "confirmed" or validation.reproducible:
        factors.append(_Factor("Confirmed / reproducible exploitation", 16))
    elif validation.cve_applicable:
        factors.append(_Factor("Applicable CVE with exploit potential", 9))

    # Lateral movement potential.
    if validation.lateral_movement_possible or model.get("lateral"):
        factors.append(_Factor("Lateral movement potential", 12))
    if validation.privilege_escalation_possible:
        factors.append(_Factor("Privilege escalation potential", 11))

    # Recovery difficulty.
    recovery = str(model.get("recovery") or "moderate")
    factors.append(_Factor(f"Recovery difficulty: {recovery}", _RECOVERY_WEIGHT.get(recovery, 7)))

    # Observation confidence tempers impact — we don't inflate impact on shaky
    # existence evidence.
    obs = int(validation.observation_confidence or 0)
    if obs < 40:
        factors.append(_Factor("Low observation confidence tempers impact", -10))
    elif obs >= 80:
        factors.append(_Factor("High observation confidence", 4))

    score = _clamp(sum(f.delta for f in factors))
    narrative = _narrative(finding, validation, profile, model, internet, blast, score)
    calibration = default_calibrator().calibrate(score, "business_impact")

    return {
        "score": score,
        "factors": [f.as_dict() for f in factors],
        "attacker_gains": narrative["attacker_gains"],
        "systems_exposed": narrative["systems_exposed"],
        "business_process_affected": narrative["business_process_affected"],
        "potential_consequences": narrative["potential_consequences"],
        "summary": narrative["summary"],
        "calibration": calibration.as_dict(),
    }


def _touches(path: AttackPath, finding: CorrelatedFinding) -> bool:
    fid = f"vuln:{finding.id}"
    return any(getattr(n, "id", "") == fid for n in path.nodes)


def _narrative(
    finding: CorrelatedFinding,
    validation: ValidationResult,
    profile: ServiceProfile,
    model: dict[str, Any],
    internet: bool,
    blast: int,
    score: int,
) -> dict[str, str]:
    label = (
        finding.canonical_entity.label if finding.canonical_entity else finding.title
    ) or finding.title
    host = finding.host or "the affected host"

    paths = profile.common_exploit_paths or []
    if validation.cve_applicable and finding.cve:
        gains = f"Exploit {finding.cve} on {label} to gain {paths[0] if paths else 'unauthorized access'}"
    elif paths:
        gains = f"Follow the {profile.display} exploit path: {paths[0]}"
    else:
        gains = f"Abuse the exposed {label} to gain a foothold on {host}"

    exposed = host
    if blast >= 2:
        exposed = f"{host} plus {blast - 1} reachable downstream asset(s)"
    elif internet:
        exposed = f"{host} (internet-facing)"

    sensitivity = str(model.get("data_sensitivity") or "unknown")
    process = {
        "critical": "systems handling business-critical or regulated data",
        "high": "sensitive internal services and data stores",
        "medium": "internet-facing service availability and integrity",
        "low": "peripheral service functionality",
    }.get(sensitivity, "service confidentiality and integrity on the affected host")

    consequences: list[str] = []
    if validation.lateral_movement_possible or model.get("lateral"):
        consequences.append("lateral movement into the internal network")
    if validation.privilege_escalation_possible:
        consequences.append("privilege escalation toward administrative control")
    if model.get("data"):
        consequences.append("bulk data disclosure or tampering")
    if not consequences:
        consequences.append("service compromise and potential data exposure")

    summary = (
        f"{profile.display} on {host} carries {'high' if score >= 66 else 'moderate' if score >= 40 else 'limited'} "
        f"business impact ({score}/100): {gains.lower()}."
    )

    return {
        "attacker_gains": gains,
        "systems_exposed": exposed,
        "business_process_affected": process,
        "potential_consequences": "; ".join(consequences),
        "summary": summary,
    }
