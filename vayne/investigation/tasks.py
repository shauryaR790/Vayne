"""Investigation Tasks (Priority 10).

Recommendations become concrete, ordered investigation tasks — not "replay
exploit" but the exact sequence a tester would run, targeted at this host / CVE,
with the confidence dimension it would move and by how much.
"""

from __future__ import annotations

from typing import Any

from vayne.models import CorrelatedFinding, ValidationResult
from vayne.service_intel.profiles import get_profile, recommendations_for


def build_investigation_tasks(
    finding: CorrelatedFinding,
    validation: ValidationResult,
) -> list[dict[str, Any]]:
    recs = recommendations_for(finding, validation)
    profile = get_profile(finding)
    host = finding.host or "target"
    cve = finding.cve
    label = (finding.canonical_entity.product if finding.canonical_entity else "") or finding.title

    tasks: list[dict[str, Any]] = []
    for rec in recs:
        steps, dim, gain = _expand(rec, profile.key, host, cve, label)
        tasks.append({
            "title": rec["action"],
            "priority": rec.get("priority", "medium"),
            "evidence_gap": rec.get("evidence_gap", ""),
            "rationale": rec.get("rationale", ""),
            "steps": steps,
            "targets_dimension": dim,
            "expected_confidence_increase": gain,
        })
    return tasks


def _expand(rec: dict, key: str, host: str, cve: str, label: str) -> tuple[list[str], str, int]:
    action = rec["action"].lower()
    target_cve = cve or "the mapped CVE"

    if "replay" in action and key in ("apache", "nginx", "iis"):
        return (
            [
                f"Replay {target_cve} against {label} on {host}",
                "Verify mod_cgi / handler prerequisites are enabled",
                "Send the encoded path-traversal probe",
                "Compare the HTTP response against the expected exploit signature",
                "Capture server access/error logs for the request",
                "Update observation and exploit confidence from the result",
            ],
            "exploit", 22,
        )
    if "script console" in action or ("jenkins" in action and "console" in action):
        return (
            [
                f"Request the Script Console endpoint on {host}",
                "Attempt an anonymous Groovy println to test access",
                "Record whether execution is permitted without auth",
                "Update exploit confidence from the result",
            ],
            "exploit", 25,
        )
    if "anonymous" in action:
        return (
            [
                f"Attempt an anonymous/guest session against {label} on {host}",
                "Enumerate what is accessible without credentials",
                "Record the exact access obtained",
                "Update observation and exploit confidence",
            ],
            "exploit", 18,
        )
    if "algorithm" in action or "cipher" in action or "kex" in action:
        return (
            [
                f"Enumerate KEX/cipher/MAC algorithms offered by {label} on {host}",
                "Flag legacy/weak algorithms (CBC, SHA1-KEX, arcfour)",
                "Record downgrade/MITM exposure",
                "Update exploit confidence",
            ],
            "exploit", 15,
        )
    if "ssl" in action or "tls" in action:
        return (
            [
                f"Initiate a TLS handshake with {label} on {host}",
                "Record protocol versions and cipher suites",
                "Confirm whether encryption is enforced",
                "Update evidence reliability",
            ],
            "reliability", 12,
        )
    if "version" in action or "fingerprint" in action:
        return (
            [
                f"Run an independent fingerprint against {label} on {host}",
                "Compare the parsed version to the current claim",
                "Resolve any version disagreement",
                "Update observation and evidence reliability",
            ],
            "reliability", 14,
        )
    if "mod_status" in action or "module" in action:
        return (
            [
                f"Probe /server-status and known module endpoints on {host}",
                "Record any exposed internal state or vulnerable modules",
                "Update business-impact and exploit confidence",
            ],
            "impact", 10,
        )
    # Generic reproduction task.
    return (
        [
            f"Reproduce the observation on {host} with a second technique",
            "Compare results and record agreement/disagreement",
            "Update evidence reliability and observation confidence",
        ],
        "reliability", 10,
    )
