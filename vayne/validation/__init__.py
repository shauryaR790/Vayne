"""Ground-truth validation loop (Phase 4).

The engine no longer only *reasons about* evidence — it distinguishes evidence
that was actually verified (authenticated checks, reproduced exploits, replayed
requests) from evidence that was merely observed, and it produces a concrete,
safe plan of validation probes that would upgrade an inferred conclusion to a
confirmed one.

Two honest guarantees:
* Verification is only asserted when genuine confirmation evidence exists in the
  scan input. The engine never fabricates a confirmation.
* Probes are *planned*, not executed, by default. A real executor can be
  registered by an operator; the default is a deterministic plan.
"""

from vayne.validation.signals import (
    VerificationEvidence,
    VerificationStrength,
    extract_verification,
)
from vayne.validation.probes import ProbePlan, ProbeRegistry, default_registry
from vayne.validation.engine import ValidationOutcome, run_validation_loop

__all__ = [
    "VerificationEvidence",
    "VerificationStrength",
    "extract_verification",
    "ProbePlan",
    "ProbeRegistry",
    "default_registry",
    "ValidationOutcome",
    "run_validation_loop",
]
