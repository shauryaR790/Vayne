"""Confidence proof objects (Phase E).

Every edge- and path-confidence calculation emits a `ConfidenceProof` so that no
number is produced by a hidden calculation. Each contributing factor is named,
carries the evidence that justified it, and records its numeric contribution.

NOTE ON LOCATION: the Phase E spec requested `vayne/models/confidence_proof.py`.
`vayne/models` is a single module (`models.py`), not a package — converting it to
a package would touch every `from vayne.models import ...` in the codebase, and
importing a dataclass into the Pydantic models module risks a circular import.
The proof object is therefore co-located with the confidence engine here, and is
serialized to plain dicts (`to_dict()`) when stored on Pydantic models
(`AttackPath.confidence_proof`, edge `confidence_proof`).

Deterministic, evidence-only. No LLMs, no randomness, no probabilistic guessing.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ConfidenceFactor:
    """A single named contributor to a confidence score.

    `weight` is the factor's value as used by the formula (e.g. a multiplicative
    factor like 0.95 or an additive/named calibration value). `contribution` is
    the human-meaningful effect of this factor (interpretation depends on the
    formula; multiplicative formulas record the running product after the factor,
    additive formulas record the points added). `evidence` lists the observed
    artifacts that justify the factor — never empty for a non-trivial factor.
    """

    name: str
    weight: float
    evidence: list[str]
    contribution: float


@dataclass
class ConfidenceProof:
    """Full, auditable derivation of a confidence value."""

    formula: str
    factors: list[ConfidenceFactor] = field(default_factory=list)
    raw_score: float = 0.0
    normalized_score: int = 0
    explanation: list[str] = field(default_factory=list)

    def add(
        self,
        name: str,
        weight: float,
        contribution: float,
        evidence: list[str] | None = None,
    ) -> "ConfidenceProof":
        self.factors.append(
            ConfidenceFactor(
                name=name,
                weight=round(float(weight), 4),
                evidence=list(evidence or []),
                contribution=round(float(contribution), 4),
            )
        )
        return self

    def finalize(self, raw_score: float, normalized_score: int) -> "ConfidenceProof":
        self.raw_score = round(float(raw_score), 4)
        self.normalized_score = int(normalized_score)
        return self

    def to_dict(self) -> dict:
        return {
            "formula": self.formula,
            "factors": [
                {
                    "name": f.name,
                    "weight": f.weight,
                    "evidence": f.evidence,
                    "contribution": f.contribution,
                }
                for f in self.factors
            ],
            "raw_score": self.raw_score,
            "normalized_score": self.normalized_score,
            "explanation": self.explanation,
        }

    def proof_summary(self) -> dict[str, float | int]:
        """Compact {factor_name: weight, ..., 'final': normalized} view —
        matches the Step 4/Step 5 example shapes."""
        out: dict[str, float | int] = {f.name: f.weight for f in self.factors}
        out["final"] = self.normalized_score
        return out


def clamp_score(value: float, *, low: int = 0, high: int = 100) -> int:
    """The ONLY post-hoc adjustment permitted on a confidence value:
    normalization into the valid [0, 100] integer range."""
    return int(max(low, min(high, round(value))))
