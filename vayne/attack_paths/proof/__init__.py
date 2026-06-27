"""VAYNE proof system (Phase G).

Backward-compatible package: the original graph/path proof models are
re-exported from `.graph`, and the Phase G acceptance/rejection/revival/
alternative proofs live alongside them.
"""

from __future__ import annotations

from vayne.attack_paths.proof.graph import (
    GraphProof,
    GraphStatistics,
    PathDiscoveryProof,
    ProofEdge,
    ProofNode,
)
from vayne.attack_paths.proof.acceptance import (
    AcceptedPathProof,
    build_accepted_proof,
)
from vayne.attack_paths.proof.rejection import (
    RejectedPathProof,
    build_rejected_proof,
)
from vayne.attack_paths.proof.revival import RevivalOption, suggest_revival
from vayne.attack_paths.proof.alternatives import AlternativePath

__all__ = [
    "GraphProof",
    "GraphStatistics",
    "PathDiscoveryProof",
    "ProofEdge",
    "ProofNode",
    "AcceptedPathProof",
    "build_accepted_proof",
    "RejectedPathProof",
    "build_rejected_proof",
    "RevivalOption",
    "suggest_revival",
    "AlternativePath",
]
