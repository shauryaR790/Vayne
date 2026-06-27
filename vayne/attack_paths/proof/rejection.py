"""Rejected-path proof (Phase G).

Every rejected path becomes explainable: why it was rejected, what evidence it
was missing, how it could be revived, and the confidence it would carry if the
missing evidence were supplied.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from vayne.attack_paths.proof.revival import suggest_revival


@dataclass
class RejectedPathProof:
    path: list[str] = field(default_factory=list)
    label: str = ""
    reject_reason: str = ""
    missing_evidence: list[str] = field(default_factory=list)
    revive_with: list[dict] = field(default_factory=list)
    confidence_if_revived: int = 0
    tools_that_can_provide_evidence: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "path": list(self.path),
            "label": self.label,
            "reject_reason": self.reject_reason,
            "missing_evidence": list(self.missing_evidence),
            "revive_with": list(self.revive_with),
            "confidence_if_revived": self.confidence_if_revived,
            "tools_that_can_provide_evidence": list(self.tools_that_can_provide_evidence),
        }


def build_rejected_proof(
    path: list[str],
    label: str,
    reject_reason: str,
    missing_evidence: list[str],
    confidence_if_revived: int = 0,
) -> RejectedPathProof:
    revival = suggest_revival(missing_evidence)
    tools: list[str] = []
    for r in revival:
        for t in r["tools"]:
            if t not in tools:
                tools.append(t)
    return RejectedPathProof(
        path=list(path),
        label=label,
        reject_reason=reject_reason,
        missing_evidence=list(missing_evidence),
        revive_with=revival,
        confidence_if_revived=confidence_if_revived,
        tools_that_can_provide_evidence=tools,
    )
