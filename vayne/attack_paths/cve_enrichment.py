"""CVE enrichment — backward-compatible exports from exploit intelligence."""

from __future__ import annotations

from vayne.attack_paths.exploit_intelligence import (
    ApplicabilityContext,
    ApplicabilityResult,
    EXPLOIT_KB,
    ExploitPrerequisite,
    ExploitRecord,
    check_prerequisite,
    evaluate_applicability,
    lookup_exploit_candidates,
)
from vayne.attack_paths.software import SoftwareFingerprint

CVERecord = ExploitRecord
CVE_CATALOG = EXPLOIT_KB


def lookup_cve_candidates(fp: SoftwareFingerprint) -> list[ExploitRecord]:
    return lookup_exploit_candidates(fp)


def applicability_status(
    record: ExploitRecord,
    scan_evidence: list[str],
) -> tuple[str, list[tuple[str, str, str | None]]]:
    """Legacy API — prefer evaluate_applicability with full context."""
    ctx = ApplicabilityContext(
        fingerprint=SoftwareFingerprint("legacy", "legacy", ""),
        scan_evidence=scan_evidence,
        open_ports=[],
    )
    result = evaluate_applicability(record, ctx)
    return result.status, result.prerequisite_results
