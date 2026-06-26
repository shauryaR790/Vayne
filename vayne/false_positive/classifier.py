"""False positive reduction and analyst time savings."""

from __future__ import annotations

from vayne.models import Classification, CorrelatedFinding, InvestigationStats, ValidationResult


def count_false_positives(validations: list[ValidationResult]) -> int:
    return sum(1 for v in validations if v.classification == Classification.FALSE_POSITIVE)


def estimate_hours_saved(
    raw_count: int, false_positives: int, correlated_count: int
) -> float:
    # Analyst ~3 min per raw finding to triage manually
    minutes = raw_count * 3 + correlated_count * 5
    saved = (false_positives * 4) + (raw_count * 1.5)
    return round(max(saved, minutes * 0.4) / 60, 1)


def build_stats(
    raw_count: int,
    correlated: list[CorrelatedFinding],
    validations: list[ValidationResult],
    attack_path_count: int,
) -> InvestigationStats:
    fp = count_false_positives(validations)
    confirmed = sum(1 for v in validations if v.classification == Classification.CONFIRMED)
    likely = sum(
        1 for v in validations if v.classification == Classification.LIKELY_EXPLOITABLE
    )
    manual = sum(1 for v in validations if v.classification == Classification.MANUAL_REVIEW)
    critical = sum(
        1
        for c, v in zip(correlated, validations)
        if c.severity.lower() in ("critical", "high")
        and v.classification != Classification.FALSE_POSITIVE
    )

    return InvestigationStats(
        findings_loaded=raw_count,
        findings_correlated=len(correlated),
        attack_paths=attack_path_count,
        false_positives_removed=fp,
        confirmed=confirmed,
        likely_exploitable=likely,
        manual_review=manual,
        analyst_hours_saved=estimate_hours_saved(raw_count, fp, len(correlated)),
        critical_count=critical,
    )
