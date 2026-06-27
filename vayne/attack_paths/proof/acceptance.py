"""Accepted-path proof (Phase G).

Every accepted path becomes fully explainable: the concrete reasons it was
accepted, the confidence/risk/blast/effort proofs that justified it, the
assumptions it rests on, and the alternative paths that were rejected in its
favor.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AcceptedPathProof:
    why_accepted: list[str] = field(default_factory=list)
    confidence_proof: dict = field(default_factory=dict)
    risk_proof: dict = field(default_factory=dict)
    blast_proof: dict = field(default_factory=dict)
    effort_proof: dict = field(default_factory=dict)
    assumptions: list[str] = field(default_factory=list)
    alternatives_rejected: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "why_accepted": list(self.why_accepted),
            "confidence_proof": self.confidence_proof,
            "risk_proof": self.risk_proof,
            "blast_proof": self.blast_proof,
            "effort_proof": self.effort_proof,
            "assumptions": list(self.assumptions),
            "alternatives_rejected": list(self.alternatives_rejected),
        }


def build_accepted_proof(
    *,
    why_accepted: list[str],
    confidence_proof: dict,
    risk_proof: dict,
    blast_proof: dict,
    effort_proof: dict,
    assumptions: list[str],
    alternatives_rejected: list[dict],
) -> AcceptedPathProof:
    return AcceptedPathProof(
        why_accepted=list(why_accepted),
        confidence_proof=confidence_proof,
        risk_proof=risk_proof,
        blast_proof=blast_proof,
        effort_proof=effort_proof,
        assumptions=list(assumptions),
        alternatives_rejected=list(alternatives_rejected),
    )
