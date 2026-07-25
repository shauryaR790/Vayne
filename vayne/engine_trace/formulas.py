"""Formula catalog — only definitions the engine actually implements."""

from __future__ import annotations

from typing import Any

from vayne.attack_paths.formulas import (
    ATTACKER_EFFORT_FORMULA,
    CONFIDENCE_FORMULA,
    EDGE_CONFIDENCE_FORMULA,
    RISK_SCORE_FORMULA,
)
from vayne.engine_trace.instrument import PRIORITY_WEIGHTS

# Mirrors vayne.confidence.finding_confidence overall mix.
FINDING_CONFIDENCE_DIM_WEIGHTS = {
    "observation": 0.34,
    "reliability": 0.24,
    "exploit": 0.24,
    "impact": 0.18,
}

SCANNER_AGREEMENT_FORMULA = (
    "scanner_agreement.ratio = len(agreed_tools) / max(len(capable_tools), 1)"
)

FINDING_CONFIDENCE_FORMULA = (
    "overall = Σ(dimension_score × dim_weight) / Σ(dim_weight)  "
    "where each dimension_score = clamp(Σ feature_deltas, 0, 100); "
    "dims without evidence are omitted"
)

PRIORITY_FORMULA = (
    "priority = clamp(round(Σ(quality_dimension × weight)), 0, 99)"
)


def formula_catalog() -> list[dict[str, Any]]:
    """Structured catalog for the Mathematical Model panel — no invented math."""
    return [
        {
            "id": "finding_confidence",
            "name": "finding_confidence()",
            "expression": FINDING_CONFIDENCE_FORMULA,
            "weights": FINDING_CONFIDENCE_DIM_WEIGHTS,
            "terms": [
                "Observation",
                "Reliability",
                "Exploitability",
                "Impact",
                "False Positive / spoofability penalties (as negative deltas)",
            ],
            "source": "vayne.confidence.finding_confidence",
        },
        {
            "id": "composite_priority_score",
            "name": "priority_score()",
            "expression": PRIORITY_FORMULA,
            "weights": PRIORITY_WEIGHTS,
            "terms": list(PRIORITY_WEIGHTS.keys()),
            "source": "vayne.investigation.quality_score.composite_priority_score",
        },
        {
            "id": "scanner_agreement",
            "name": "scanner_agreement()",
            "expression": SCANNER_AGREEMENT_FORMULA,
            "weights": {},
            "terms": ["agreed_tools", "capable_tools"],
            "source": "vayne.correlator.engine._scanner_agreement",
        },
        {
            "id": "edge_confidence",
            "name": "edge_confidence()",
            "expression": EDGE_CONFIDENCE_FORMULA,
            "weights": {},
            "terms": ["passed_checks", "source_count", "validation_confidence"],
            "source": "vayne.attack_paths.formulas.edge_confidence_contribution",
        },
        {
            "id": "path_confidence",
            "name": "path_confidence()",
            "expression": CONFIDENCE_FORMULA,
            "weights": {},
            "terms": ["edge.confidence_contribution"],
            "source": "vayne.attack_paths.formulas",
        },
        {
            "id": "risk_score",
            "name": "risk_score()",
            "expression": RISK_SCORE_FORMULA,
            "weights": {},
            "terms": [
                "cvss_base",
                "maturity_factor",
                "access_factor",
                "auth_factor",
                "evidence_factor",
                "blast_factor",
                "privilege_factor",
            ],
            "source": "vayne.attack_paths.formulas",
        },
        {
            "id": "attacker_effort",
            "name": "attacker_effort()",
            "expression": ATTACKER_EFFORT_FORMULA,
            "weights": {},
            "terms": ["path_hop_count"],
            "source": "vayne.attack_paths.formulas",
        },
    ]
