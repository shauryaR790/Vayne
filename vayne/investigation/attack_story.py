"""Attack Story Generator (Priority 9).

Business impact becomes a narrative an analyst can read: a concrete, ordered
chain of what an attacker does, grounded in the service profile, the observed
version/CVE, and the host. Each service produces a distinct story — the steps
are gated on evidence (a data step only appears for data services, a lateral
step only when lateral movement is in play).
"""

from __future__ import annotations

from typing import Any

from vayne.models import AttackPath, CorrelatedFinding, ValidationResult
from vayne.service_intel.profiles import ServiceProfile


def build_attack_story(
    finding: CorrelatedFinding,
    validation: ValidationResult,
    profile: ServiceProfile,
    business_impact: dict[str, Any],
    attack_paths: list[AttackPath] | None = None,
) -> dict[str, Any]:
    attack_paths = attack_paths or []
    entity = finding.canonical_entity
    label = (entity.product if entity else "") or (entity.service if entity else "") or finding.title
    host = finding.host or "the host"
    cve = finding.cve
    model = profile.business_impact_model or {}

    steps = _steps_for(profile.key, label, cve, model, validation)

    # Gate optional consequences on evidence.
    if validation.lateral_movement_possible or model.get("lateral"):
        steps.append(_step("Lateral movement", f"Move laterally from {host} into adjacent internal systems"))
    if model.get("data"):
        steps.append(_step("Data compromise", "Access or tamper with sensitive records in scope"))

    opening = steps[0]["action"] if steps else f"Abuse exposed {label}"
    if validation.reproducible:
        posture = "This chain is supported by a reproduced result."
    elif validation.cve_applicable and cve:
        posture = f"This chain is plausible via {cve} but exploitation has not yet been reproduced."
    else:
        posture = "This chain is hypothetical until the first step is reproduced."

    return {
        "title": f"Attack story: {label} on {host}",
        "opening": opening,
        "steps": steps,
        "posture": posture,
        "business_impact_score": business_impact.get("score"),
        "attacker_gains": business_impact.get("attacker_gains"),
        "systems_exposed": business_impact.get("systems_exposed"),
    }


def _step(stage: str, action: str) -> dict[str, str]:
    return {"stage": stage, "action": action}


def _steps_for(key: str, label: str, cve: str, model: dict, validation: ValidationResult) -> list[dict[str, str]]:
    entry_cve = f" via {cve}" if cve else ""
    if key in ("apache", "nginx", "iis"):
        return [
            _step("Initial access", f"Gain public code execution on {label}{entry_cve}"),
            _step("Foothold", "Deploy a web shell for persistent command execution"),
            _step("Discovery", "Read application configuration and environment files"),
            _step("Credential access", "Recover database and service secrets from config"),
            _step("Pivot", "Pivot to backend datastores using recovered credentials"),
        ]
    if key == "jenkins":
        return [
            _step("Initial access", "Reach the Jenkins Script Console / CLI"),
            _step("Execution", "Run Groovy to compromise the controller"),
            _step("Credential access", "Extract stored build credentials and tokens"),
            _step("Lateral movement", "Use CI credentials to move into connected systems"),
        ]
    if key in ("mysql", "postgresql"):
        return [
            _step("Initial access", f"Compromise {label} authentication{entry_cve}"),
            _step("Data access", "Read sensitive records from application databases"),
            _step("Escalation", "Leverage DB functions toward host command execution"),
            _step("Impact", "Achieve application takeover via data/credential control"),
        ]
    if key == "redis":
        return [
            _step("Initial access", "Connect to unauthenticated Redis"),
            _step("Execution", "Abuse CONFIG SET to write key material / web shell"),
            _step("Foothold", "Obtain command execution on the host"),
        ]
    if key == "mongodb":
        return [
            _step("Initial access", "Connect to unauthenticated MongoDB"),
            _step("Data access", "Read and exfiltrate all collections"),
            _step("Impact", "Tamper with or ransom exposed data"),
        ]
    if key == "smb":
        return [
            _step("Initial access", f"Abuse {label} exposure (signing/guest/SMBv1)"),
            _step("Credential access", "Relay NTLM or read accessible shares"),
            _step("Lateral movement", "Move laterally using relayed authentication"),
        ]
    if key == "ldap":
        return [
            _step("Initial access", "Perform an anonymous bind against the directory"),
            _step("Discovery", "Enumerate users, groups, and SPNs"),
            _step("Credential access", "Kerberoast exposed SPNs for offline cracking"),
        ]
    if key == "ssh":
        return [
            _step("Initial access", f"Authenticate to {label} via weak credentials{entry_cve}"),
            _step("Foothold", "Obtain an interactive shell on the host"),
            _step("Escalation", "Escalate privileges from the initial account"),
        ]
    if key == "ftp":
        return [
            _step("Initial access", f"Log in to {label} anonymously{entry_cve}"),
            _step("Discovery", "Enumerate accessible files and upload paths"),
            _step("Foothold", "Leverage writable paths toward execution"),
        ]
    return [
        _step("Initial access", f"Exploit exposed {label}{entry_cve}"),
        _step("Foothold", "Establish access on the affected host"),
    ]
