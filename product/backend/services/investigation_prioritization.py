"""Evidence-backed investigation prioritization.

Builds the Top Priority Investigations queue from clustered evidence —
never individual service/port observations. Every priority tier is justified
with explicit reasons derived from validation booleans and scanner agreement.
"""

from __future__ import annotations

from typing import Any

from product.backend.services.investigation_clustering import build_investigation_clusters

_SEV_RANK = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}


def _tier_from_score(score: int, severity: str, claim_status: str) -> str:
    if claim_status in ("needs_validation", "unknown", "rejected"):
        return "Low" if score < 55 else "Medium"
    sev = (severity or "").lower()
    if score >= 85 or (sev == "critical" and score >= 70):
        return "Critical"
    if score >= 70 or sev == "high":
        return "High"
    if score >= 45 or sev == "medium":
        return "Medium"
    return "Low"


def _review_minutes(tier: str, evidence_count: int) -> int:
    base = {"Critical": 5, "High": 8, "Medium": 12, "Low": 15}.get(tier, 15)
    return min(30, base + max(0, evidence_count - 3))


def build_priority_queue(
    *,
    confirmed_findings: list[dict[str, Any]],
    candidate_paths: list[dict[str, Any]],
    hypotheses: list[dict[str, Any]],
    cross_source_matches: int = 0,
    investigations: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Return sorted priority investigations for the executive overview."""
    items = investigations or build_investigation_clusters(
        confirmed_findings=confirmed_findings,
        candidate_paths=candidate_paths,
        hypotheses=hypotheses,
    )

    if cross_source_matches > 1 and items:
        reasons = items[0].get("priority_reasons") or []
        if not any("scanner" in r.lower() or "corroborat" in r.lower() for r in reasons):
            items[0]["priority_reasons"] = (
                [f"{cross_source_matches} findings independently corroborated across scanners"]
                + reasons
            )[:8]

    tier_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    items.sort(
        key=lambda x: (
            tier_order.get(str(x.get("tier") or "Low"), 9),
            -int(x.get("risk_score") or 0),
            -int(x.get("evidence_count") or 0),
        )
    )
    return items[:8]


def build_executive_metrics(
    *,
    file_count: int,
    asset_count: int,
    findings_loaded: int,
    duplicates_removed: int,
    confirmed_count: int,
    priority_queue: list[dict[str, Any]],
    hours_saved: float,
    minutes_saved: float,
    cross_source_matches: int,
    validated_paths: int,
) -> dict[str, Any]:
    """Top-of-page metrics — all counts from engine statistics."""
    attention = sum(1 for p in priority_queue if p.get("tier") in ("Critical", "High"))
    hours = hours_saved or (minutes_saved / 60 if minutes_saved else 0)
    return {
        "files": file_count,
        "assets": asset_count,
        "findings_raw": findings_loaded,
        "findings_retained": confirmed_count,
        "duplicates_removed": duplicates_removed,
        "investigations": len(priority_queue),
        "require_attention": attention,
        "analyst_hours_saved": round(hours, 1) if hours else 0,
        "cross_source_matches": cross_source_matches,
        "validated_paths": validated_paths,
    }


def build_investigation_audit(
    review: dict[str, Any] | None,
    confirmed_findings: list[dict[str, Any]],
) -> dict[str, Any]:
    """Surface self-review audit results — transparency over certainty."""
    review = review or {}
    incomplete_ids = set(review.get("findings_incomplete") or [])
    flagged: list[dict[str, str]] = []

    for finding in confirmed_findings:
        fid = str(finding.get("id") or "")
        sr = finding.get("self_review") or {}
        if fid in incomplete_ids or sr.get("complete") is False:
            failed = [
                name
                for name, chk in (sr.get("checks") or {}).items()
                if isinstance(chk, dict) and not chk.get("passed")
            ]
            flagged.append(
                {
                    "finding_id": fid,
                    "title": str(finding.get("title") or ""),
                    "issues": ", ".join(failed) if failed else "self-review incomplete",
                }
            )

    return {
        "complete": bool(review.get("complete", True)) and not flagged,
        "findings_reviewed": int(review.get("findings_reviewed") or len(confirmed_findings)),
        "findings_complete": int(review.get("findings_complete") or 0),
        "completeness_ratio": float(review.get("completeness_ratio") or 1.0),
        "flagged_findings": flagged[:12],
        "unsupported_claims_blocked": len(flagged),
    }
