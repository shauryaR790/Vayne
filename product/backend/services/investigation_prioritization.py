"""Evidence-backed investigation prioritization.

Builds the Top Priority Investigations queue from engine-retained findings,
validated attack paths, and open hypotheses. Every priority tier is justified
with explicit reasons derived from validation booleans and scanner agreement —
never from severity labels alone.
"""

from __future__ import annotations

from typing import Any

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


def _priority_reasons_finding(finding: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    sources = finding.get("sources") or []
    validated = finding.get("validated_checks") or []
    not_validated = finding.get("not_validated_checks") or []
    severity = str(finding.get("severity") or "").upper()
    cve = str(finding.get("cve") or "").strip()
    claim = str(finding.get("claim_status") or "")

    if len(sources) >= 2:
        reasons.append(f"Observed by {len(sources)} independent scanners ({', '.join(sources[:4])})")
    elif sources:
        reasons.append(f"Single-source observation ({sources[0]}) — cross-scanner agreement limited")

    if "Reachable from entry point" in validated:
        reasons.append("Reachable from an entry point in the attack graph")
    if "Internet-facing exposure" in str(finding.get("business_impact_detail") or {}).lower():
        reasons.append("Internet-facing exposure indicated by reachability evidence")
    elif finding.get("host") and "internet" in str(finding.get("why_it_matters") or "").lower():
        reasons.append("Internet-facing asset referenced in analyst assessment")

    if cve and "CVE matched" in validated:
        reasons.append(f"CVE applicability confirmed ({cve})")
    elif cve:
        reasons.append(f"CVE associated ({cve}) — applicability not fully confirmed")

    if str(finding.get("confidence", {}).get("kind") or "") == "exploit":
        reasons.append("Exploit confidence dimension is the primary signal")
    if "Privilege escalation" in validated:
        reasons.append("Privilege escalation possible per validation checks")
    if "Lateral movement" in validated:
        reasons.append("Lateral movement possible per validation checks")

    bi = finding.get("business_impact_detail") or {}
    for factor in (bi.get("factors") or [])[:3]:
        label = str(factor.get("label") or "").strip()
        if label and factor.get("delta", 0) > 0:
            reasons.append(label)

    if severity == "CRITICAL":
        reasons.append("Scanner severity classification: CRITICAL")
    elif severity == "HIGH" and len(reasons) < 2:
        reasons.append("Scanner severity classification: HIGH")

    if finding.get("review_incomplete"):
        reasons.append("Self-review flagged incomplete evidence chain — treat as needs validation")

    if claim == "needs_validation":
        reasons.append("Claim status: needs validation before asserting compromise")
    elif claim == "suspected":
        reasons.append("Claim status: suspected — observation confirmed, exploitation not reproduced")

    if not reasons:
        reasons.append("Retained finding with analyst-review-worthy exposure")

    # De-dupe while preserving order
    seen: set[str] = set()
    out: list[str] = []
    for r in reasons:
        key = r.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out[:8]


def _priority_reasons_path(path: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    if path.get("status") == "VALIDATED":
        reasons.append("Attack path survived all evidence gates")
    conf = int(path.get("confidence") or 0)
    if conf >= 70:
        reasons.append(f"Path confidence {conf}%")
    risk = float(path.get("risk") or 0)
    if risk >= 7:
        reasons.append(f"Risk score {risk:.1f}/10")
    reason = str(path.get("reason") or "").strip()
    if reason and reason not in reasons:
        reasons.append(reason[:180])
    missing = path.get("missing") or []
    if missing:
        reasons.append(f"Missing for full validation: {missing[0]}")
    return reasons[:6] or ["Validated chain with supporting evidence across the environment."]


def _business_impact_line(finding: dict[str, Any]) -> str:
    detail = finding.get("business_impact_detail") or {}
    summary = str(detail.get("summary") or finding.get("business_impact") or "").strip()
    if summary and "needs validation" not in summary.lower() and "unknown" not in summary.lower():
        return summary[:220]
    return "Operational impact unknown until exploitation is validated."


def _evidence_count_finding(finding: dict[str, Any]) -> int:
    evidence = finding.get("evidence") or []
    proof = finding.get("proof") or []
    sources = finding.get("sources") or []
    notebook = (finding.get("investigation") or {}).get("structured_notebook") or {}
    nb_ev = notebook.get("evidence") or []
    return len(set(evidence + [p.get("detail", "") for p in proof] + sources + nb_ev))


def _claim_status_finding(finding: dict[str, Any]) -> str:
    if finding.get("claim_status"):
        return str(finding["claim_status"])
    classification = str(finding.get("classification") or "").upper()
    validated = finding.get("validated_checks") or []
    if "Arbitrary command execution" in validated or "Interactive shell" in validated:
        return "confirmed"
    if "CONFIRMED" in classification:
        return "confirmed"
    if "LIKELY" in classification:
        return "suspected"
    if "OBSERVED" in classification:
        return "observed"
    return "needs_validation"


def build_priority_queue(
    *,
    confirmed_findings: list[dict[str, Any]],
    candidate_paths: list[dict[str, Any]],
    hypotheses: list[dict[str, Any]],
    cross_source_matches: int = 0,
) -> list[dict[str, Any]]:
    """Return sorted priority investigations for the executive overview."""
    items: list[dict[str, Any]] = []
    seen_titles: set[str] = set()

    for i, path in enumerate(candidate_paths):
        if path.get("status") != "VALIDATED":
            continue
        title = _path_title(path)
        key = title.lower()[:48]
        if key in seen_titles:
            continue
        seen_titles.add(key)
        score = max(int(path.get("confidence") or 0), int(round(float(path.get("risk") or 0) * 10)))
        tier = _tier_from_score(score, "high", "suspected")
        reasons = _priority_reasons_path(path)
        items.append(
            {
                "id": f"path-{i}",
                "kind": "attack_path",
                "tier": tier,
                "title": title,
                "risk_score": min(99, score),
                "evidence_count": len(path.get("steps") or []),
                "confidence": int(path.get("confidence") or 0),
                "claim_status": "suspected",
                "priority_reasons": reasons,
                "business_impact": "Validated attack path — review chain for operational blast radius.",
                "estimated_review_minutes": _review_minutes(tier, len(path.get("steps") or [])),
                "detail_section_id": "attack-graph",
                "evidence_items": [str(s) for s in (path.get("steps") or [])[:6]],
                "missing_evidence": [str(m) for m in (path.get("missing") or [])[:4]],
            }
        )

    for i, finding in enumerate(confirmed_findings):
        title = _finding_title(finding)
        key = str(finding.get("title") or "").lower()[:32]
        if key and key in seen_titles:
            continue
        if key:
            seen_titles.add(key)

        score = int(finding.get("machine_confidence") or 0)
        claim = _claim_status_finding(finding)
        if finding.get("review_incomplete"):
            score = min(score, 55)
            claim = "needs_validation"
        tier = _tier_from_score(score, str(finding.get("severity") or ""), claim)
        ev_count = _evidence_count_finding(finding)
        notebook = (finding.get("investigation") or {}).get("structured_notebook") or {}

        items.append(
            {
                "id": str(finding.get("id") or f"finding-{i}"),
                "kind": "finding",
                "tier": tier,
                "title": title,
                "risk_score": score,
                "evidence_count": ev_count,
                "confidence": score,
                "claim_status": claim,
                "priority_reasons": _priority_reasons_finding(finding),
                "business_impact": _business_impact_line(finding),
                "estimated_review_minutes": _review_minutes(tier, ev_count),
                "detail_section_id": "findings",
                "evidence_items": (notebook.get("evidence") or finding.get("evidence") or [])[:6],
                "missing_evidence": (notebook.get("missing_evidence") or [])[:4],
            }
        )

    for i, hyp in enumerate(hypotheses[:3]):
        score = int(hyp.get("confidence") or 50)
        tier = _tier_from_score(score, "medium", "suspected")
        title = str(hyp.get("title") or "Open hypothesis")
        items.append(
            {
                "id": f"hyp-{i}",
                "kind": "hypothesis",
                "tier": tier,
                "title": title,
                "risk_score": score,
                "evidence_count": 1,
                "confidence": score,
                "claim_status": "needs_validation",
                "priority_reasons": [
                    str(hyp.get("reason") or "Hypothesis requires validation before closing."),
                    str(hyp.get("required_validation") or "Controlled validation recommended."),
                ],
                "business_impact": "Unknown until hypothesis is validated.",
                "estimated_review_minutes": _review_minutes(tier, 2),
                "detail_section_id": "reasoning",
                "evidence_items": [str(hyp.get("current_evidence") or "")][:2],
                "missing_evidence": [str(hyp.get("required_validation") or "")][:1],
            }
        )

    if cross_source_matches > 1 and not any(
        "independent scanners" in " ".join(it.get("priority_reasons") or []).lower()
        for it in items
    ):
        # Surface correlation as context on the top finding if present
        if items and items[0].get("kind") == "finding":
            items[0]["priority_reasons"] = (
                [f"{cross_source_matches} findings independently corroborated across scanners"]
                + (items[0].get("priority_reasons") or [])
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


def _path_title(path: dict[str, Any]) -> str:
    steps = path.get("steps") or []
    if len(steps) >= 2:
        return f"{steps[0]} → {steps[-1]} attack path"
    if len(steps) == 1:
        return f"{steps[0]} exposure path"
    return "Validated attack path"


def _finding_title(finding: dict[str, Any]) -> str:
    host = finding.get("host") or ""
    short_host = host.split(".")[0] if host else ""
    suffix = f" on {short_host}" if short_host else ""
    return f"{finding.get('title') or 'Finding'}{suffix}"
