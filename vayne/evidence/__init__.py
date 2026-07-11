"""Evidence intelligence layer (Phase 2).

Not all evidence is equal. This package classifies the trustworthiness of every
piece of scanner evidence (``quality``) and reconstructs findings as a typed
evidence graph (``evidence_graph``).
"""

from vayne.evidence.quality import (
    EvidenceQuality,
    ReliabilityTier,
    aggregate_quality,
    classify_evidence,
)

__all__ = [
    "EvidenceQuality",
    "ReliabilityTier",
    "aggregate_quality",
    "classify_evidence",
]
