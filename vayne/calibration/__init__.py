"""Probability calibration (Phase 4).

Hypothesis probabilities and business-impact scores are principled heuristic
constructions. This package makes them *calibratable*: it can be fit against
labeled outcomes to map a raw score to an empirically-observed frequency, it
persists/loads that mapping, and it evaluates calibration quality (Brier score
and expected calibration error).

Until a mapping is fit from real outcomes, calibration is the identity function
and every calibrated value is labeled ``calibrated=False`` so the engine never
overstates how empirically grounded a number is.
"""

from vayne.calibration.model import (
    CalibratedValue,
    Calibrator,
    default_calibrator,
    evaluate_calibration,
)

__all__ = [
    "CalibratedValue",
    "Calibrator",
    "default_calibrator",
    "evaluate_calibration",
]
