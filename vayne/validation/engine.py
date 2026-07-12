"""Validation loop orchestration.

Combines what was *already verified* in the scan (authenticated / reproduced /
replayed evidence) with what *could be run* to close the gap (probe plans), and
produces a single honest outcome:

* ``exploit_confirmed`` — True only when genuine reproduction/authenticated
  evidence exists in the input.
* ``confidence_delta`` — the exploit-confidence adjustment justified by the
  verification strength (positive) with a clear reason.
* ``next_probes`` — the ranked plan of validation actions that would move an
  inferred conclusion toward a confirmed one, each with an expected gain.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from vayne.models import CorrelatedFinding, ValidationResult
from vayne.validation.probes import ProbePlan, ProbeRegistry, default_registry
from vayne.validation.signals import (
    VerificationEvidence,
    VerificationStrength,
    extract_verification,
)

# Exploit-confidence delta justified by each verification strength.
_STRENGTH_DELTA = {
    VerificationStrength.NONE: 0,
    VerificationStrength.WEAK: 4,
    VerificationStrength.STRONG: 14,
    VerificationStrength.CONFIRMED: 30,
}


@dataclass
class ValidationOutcome:
    verification: VerificationEvidence
    exploit_confirmed: bool
    confidence_delta: int
    reason: str
    next_probes: list[ProbePlan] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "verification": self.verification.as_dict(),
            "exploit_confirmed": self.exploit_confirmed,
            "confidence_delta": self.confidence_delta,
            "reason": self.reason,
            "next_probes": [p.as_dict() for p in self.next_probes],
            "open_probe_count": len([p for p in self.next_probes if p.result == "planned"]),
        }


def run_validation_loop(
    finding: CorrelatedFinding,
    validation: ValidationResult | None = None,
    registry: ProbeRegistry | None = None,
) -> ValidationOutcome:
    reg = registry or default_registry()
    verification = extract_verification(finding)
    strength = VerificationStrength(int(verification.strength))
    delta = _STRENGTH_DELTA[strength]
    confirmed = strength == VerificationStrength.CONFIRMED

    if confirmed:
        method = "reproduction" if verification.reproduced else "an authenticated check"
        reason = (
            f"Exploitability is confirmed by {method}; the confidence upgrade "
            f"(+{delta}) is earned by real evidence, not inferred."
        )
    elif strength == VerificationStrength.STRONG:
        reason = (
            f"An active probe (replay/handshake) corroborates the observation "
            f"(+{delta}); reproduction would still be required to confirm exploitability."
        )
    elif strength == VerificationStrength.WEAK:
        reason = (
            f"Multiple independent sources corroborate the observation (+{delta}), "
            f"but no active verification has been performed."
        )
    else:
        reason = (
            "No verification evidence is present — this remains an observation. "
            "Exploit confidence stays inferred until a probe is run."
        )

    next_probes = [p for p in reg.plan(finding) if not (confirmed and p.method == "exploit_replay")]
    return ValidationOutcome(
        verification=verification,
        exploit_confirmed=confirmed,
        confidence_delta=delta,
        reason=reason,
        next_probes=next_probes,
    )
