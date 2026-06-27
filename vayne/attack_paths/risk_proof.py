"""Risk proof objects (Phase F).

Mirrors `ConfidenceProof`: every contributor to a risk score is a named
`RiskFactor` carrying the evidence that justified it and its numeric
contribution. No anonymous constants — the risk number is fully reconstructable
from the proof.

Deterministic, evidence-only. No LLMs, no randomness.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class RiskFactor:
    name: str
    weight: float
    evidence: list[str]
    contribution: float


@dataclass
class RiskProof:
    formula: str
    factors: list[RiskFactor] = field(default_factory=list)
    raw_score: float = 0.0
    normalized_score: float = 0.0
    explanation: list[str] = field(default_factory=list)

    def add(
        self,
        name: str,
        weight: float,
        contribution: float,
        evidence: list[str] | None = None,
    ) -> "RiskProof":
        self.factors.append(
            RiskFactor(
                name=name,
                weight=round(float(weight), 4),
                evidence=list(evidence or []),
                contribution=round(float(contribution), 4),
            )
        )
        return self

    def finalize(self, raw_score: float, normalized_score: float) -> "RiskProof":
        self.raw_score = round(float(raw_score), 4)
        self.normalized_score = round(float(normalized_score), 4)
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
