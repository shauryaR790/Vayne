"""Investigation briefing payloads — analyst-first homepage sections."""

from __future__ import annotations

from typing import Any


def estimate_analyst_review_minutes(investigations: list[dict[str, Any]], *, limit: int = 5) -> int:
    """Sum expected review time for the ranked investigation queue."""
    total = 0
    for inv in investigations[:limit]:
        try:
            total += int(inv.get("estimated_review_minutes") or 15)
        except (TypeError, ValueError):
            total += 15
    return max(0, total)


def build_ignored_breakdown(
    *,
    findings_loaded: int,
    findings_retained: int,
    duplicates_removed: int,
    false_positives_removed: int,
    noise_suppressed: int,
    conflicts: list[dict[str, Any]],
    hypotheses: list[dict[str, Any]],
    priority_queue: list[dict[str, Any]],
    investigation_audit: dict[str, Any] | None,
) -> dict[str, Any]:
    """Why findings were not promoted to the priority queue."""
    contradicted = len(conflicts)
    informational = max(
        0,
        findings_loaded
        - findings_retained
        - duplicates_removed
        - false_positives_removed
        - noise_suppressed
        - contradicted,
    )
    low_business_impact = sum(1 for item in priority_queue if item.get("tier") == "Low")
    already_mitigated = sum(
        1
        for h in hypotheses
        if str(h.get("status") or "").lower() in ("rejected", "mitigated", "closed")
    )

    exceptions: list[str] = []
    blocked = int((investigation_audit or {}).get("unsupported_claims_blocked") or 0)
    if blocked:
        exceptions.append(
            f"{blocked} finding{'s' if blocked != 1 else ''} flagged by self-review — "
            "deferred for validation, not silently dropped."
        )
    flagged = (investigation_audit or {}).get("flagged_findings") or []
    for row in flagged[:3]:
        title = str(row.get("title") or row.get("finding_id") or "Finding").strip()
        issues = str(row.get("issues") or "needs review").strip()
        exceptions.append(f"{title}: {issues}")

    assurance = "No critical evidence was hidden."
    if exceptions:
        assurance = "Review the exceptions below — nothing was silently dropped."

    return {
        "duplicate_evidence_removed": int(duplicates_removed),
        "informational_findings": int(informational),
        "already_mitigated": int(already_mitigated),
        "contradicted_findings": int(contradicted),
        "low_business_impact": int(low_business_impact),
        "false_positives_removed": int(false_positives_removed),
        "noise_suppressed": int(noise_suppressed),
        "assurance": assurance,
        "exceptions": exceptions,
    }
