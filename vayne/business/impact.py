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
    service_name = profile.display or label
    sensitivity = str(model.get("data_sensitivity") or "unknown")

    # Plain-language outcome — what actually happens to the business.
    if validation.privilege_escalation_possible:
        attacker_gains = (
            "An attacker could gain administrative control — install ransomware, "
            "create backdoors, or access any data on connected systems."
        )
    elif validation.reproducible or str(validation.exploitability_status) == "confirmed":
        attacker_gains = (
            f"An attacker could take over {service_name} on {host} and run their own code — "
            "stealing files, encrypting systems, or using it as a launch point inside your network."
        )
    elif validation.lateral_movement_possible or model.get("lateral"):
        attacker_gains = (
            f"An attacker who gets in via {service_name} could spread to other internal systems — "
            "finance, HR, customer databases, or production servers."
        )
    elif validation.auth_required:
        attacker_gains = (
            f"An attacker with stolen or guessed credentials could access {service_name} and "
            "the business data it handles."
        )
    elif internet:
        attacker_gains = (
            f"Anyone on the internet could reach {service_name} on {host} and attempt to "
            "break in — no VPN or office access required."
        )
    else:
        attacker_gains = (
            f"An attacker inside your network could abuse {service_name} to disrupt operations "
            "or access sensitive information."
        )

    if internet:
        systems_exposed = (
            f"{host} is reachable from the public internet — customers, partners, and attackers "
            "worldwide can attempt access."
        )
    elif blast >= 2:
        systems_exposed = (
            f"{host} plus up to {blast} connected internal systems that depend on it or trust it."
        )
    else:
        systems_exposed = f"Internal systems on or around {host}."

    process = {
        "critical": "Regulated or business-critical data (customer records, financials, health data, IP)",
        "high": "Internal applications, employee data, and customer-facing backends",
        "medium": "Public websites, customer portals, and online services your users rely on",
        "low": "Supporting IT services that keep day-to-day operations running",
    }.get(sensitivity, "Operations and data handled by the affected server")

    consequences: list[str] = []
    if internet and score >= 40:
        consequences.append("Public security incident — reputational damage and customer churn")
    if sensitivity in ("critical", "high") or model.get("data"):
        consequences.append("Theft or leak of confidential business and customer data")
    if validation.lateral_movement_possible or model.get("lateral"):
        consequences.append("Outage or compromise spreading to other departments' systems")
    if validation.privilege_escalation_possible:
        consequences.append("Full server takeover — ransomware, data destruction, or persistent access")
    if score >= 66:
        consequences.append("Extended downtime, missed SLAs, and lost revenue while recovering")
    elif score >= 40:
        consequences.append("Disruption to staff and customers who depend on this service")
    if not consequences:
        consequences.append("Unauthorized access to business data or interruption of service")

    severity_word = "critical" if score >= 66 else "moderate" if score >= 40 else "limited"
    summary = (
        f"{service_name} on {host} poses {severity_word} business risk ({score}/100). "
        f"{consequences[0].rstrip('.')}."
    )

    return {
        "attacker_gains": attacker_gains,
        "systems_exposed": systems_exposed,
        "business_process_affected": process,
        "potential_consequences": "; ".join(consequences[:4]),
        "summary": summary,
    }
