"""Investigation summary panel — file-agnostic analyst metrics."""

from __future__ import annotations

from typing import Any


def build_summary_panel(
    *,
    file_count: int,
    investigations: list[dict[str, Any]],
    evidence_signals: int,
    duplicates_removed: int,
    hours_saved: float,
    noise_suppressed: int = 0,
) -> dict[str, Any]:
    """Summary metrics shown above investigations — never raw finding counts as hero."""
    urgent = sum(1 for inv in investigations if inv.get("tier") in ("Critical", "High"))
    review_minutes = sum(int(inv.get("estimated_review_minutes") or 15) for inv in investigations[:5])
    return {
        "files_uploaded": int(file_count),
        "investigations_generated": len(investigations),
        "evidence_signals": int(evidence_signals),
        "duplicate_findings_removed": int(duplicates_removed),
        "investigations_requiring_immediate_review": urgent,
        "estimated_analyst_hours_saved": round(float(hours_saved or 0), 1),
        "estimated_analyst_review_minutes": max(0, review_minutes),
        "noise_suppressed": int(noise_suppressed),
    }
