"""False positive classification."""

from __future__ import annotations

from vayne.models.schemas import Classification, CorrelatedFinding, ValidationResult


def classify(
    finding: CorrelatedFinding, validation: ValidationResult
) -> Classification:
    if validation.validated and validation.confidence >= 85:
        return Classification.CONFIRMED

    if validation.likely_false_positive and validation.confidence >= 70:
        return Classification.PROBABLE_FALSE_POSITIVE

    if validation.exploitation_possible and validation.confidence >= 65:
        return Classification.LIKELY_EXPLOITABLE

    if validation.auth_required or not validation.version_confirmed:
        return Classification.MANUAL_REVIEW

    if validation.likely_false_positive:
        return Classification.PROBABLE_FALSE_POSITIVE

    return Classification.MANUAL_REVIEW


def status_label(classification: Classification, validation: ValidationResult) -> str:
    if classification == Classification.CONFIRMED:
        return "VALIDATED"
    if classification == Classification.LIKELY_EXPLOITABLE:
        return "LIKELY EXPLOITABLE"
    if classification == Classification.PROBABLE_FALSE_POSITIVE:
        return "LIKELY FALSE POSITIVE"
    return "MANUAL REVIEW"
