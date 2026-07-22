"""Canonical investigation contract — analyst-facing schema (engine export).

Users think in investigations, not files or findings. Every exported investigation
must answer: what to investigate, why it matters, what supports it, what to do next.
"""

from __future__ import annotations

import re
from typing import Any

from vayne.models import InvestigatedFinding

_IDENTITY_RE = re.compile(
    r"(?i)kerberos|active directory|ldap|ntlm|spn|bloodhound|domain admin|"
    r"delegation|dcsync|as-rep|kerberoast|service account|iam role|identity"
)

# Internal engine hypotheses — never analyst-facing investigations.
_INTERNAL_HYPOTHESIS_TITLE = re.compile(
    r"(?i)false fingerprint|not applicable|not exploitable|missing preconditions|"
    r"reverse proxy / load balancer|compensated by controls|open security hypothesis|"
    r"validate hypothesis in controlled"
)


def is_analyst_facing_investigation(inv: dict[str, Any]) -> bool:
    """Return False for internal reasoning artifacts masquerading as investigations."""
    if str(inv.get("cluster_type") or "") == "hypothesis":
        return False
    if str(inv.get("kind") or "") == "hypothesis":
        return False
    if str(inv.get("id") or "").startswith("hyp:"):
        return False

    title = str(inv.get("title") or "").strip()
    if not title or _INTERNAL_HYPOTHESIS_TITLE.search(title):
        return False

    finding_ids = [x for x in (inv.get("finding_ids") or []) if x]
    has_path = bool(inv.get("path"))
    has_evidence = bool(inv.get("evidence_ledger") or inv.get("evidence"))
    has_sources = bool(inv.get("evidence_sources"))
    has_signals = int(inv.get("evidence_count") or 0) > 0

    if not (finding_ids or has_path or has_sources or has_evidence or has_signals):
        return False

    tier = str(inv.get("tier") or "Low")
    score = int(inv.get("priority_score") or inv.get("risk_score") or 0)
    if tier == "Low" and score < 40 and not finding_ids and not has_sources:
        return False

    return True


def filter_analyst_investigations(investigations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep only investigations that deserve analyst queue placement."""
    return [inv for inv in investigations if is_analyst_facing_investigation(inv)]


def finalize_investigation_list(investigations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Apply contract + rank to a sorted investigation list."""
    visible = filter_analyst_investigations(investigations)
    out: list[dict[str, Any]] = []
    for index, inv in enumerate(visible, start=1):
        out.append(finalize_investigation(inv, rank=index))
    return out


def finalize_investigation(
    inv: dict[str, Any],
    *,
    rank: int = 0,
    members: list[InvestigatedFinding] | None = None,
) -> dict[str, Any]:
    """Normalize one investigation to the full analyst contract."""
    members = members or []
    reasoning = inv.get("reasoning_chain") or {}
    critique = inv.get("self_critique") or {}
    purpose = inv.get("purpose") or {}
    quality = inv.get("quality_score") or {}

    alternative_explanations = _unique_strings(
        (reasoning.get("alternative_explanations") or [])
        + (critique.get("better_explanations") or [])
    )[:4]

    affected_identities = _affected_identities(inv, members)
    analyst_tasks = _analyst_tasks(inv, members, reasoning)
    evidence = _evidence_records(inv, members)
    timeline = inv.get("timeline") or inv.get("evidence_timeline") or {}
    why_ranked = _why_ranked_here(inv, rank=rank, quality=quality)

    tier = str(inv.get("tier") or "Medium")
    priority_score = int(inv.get("priority_score") or inv.get("risk_score") or 0)
    confidence = int(inv.get("confidence") or priority_score)

    out = dict(inv)
    out.update(
        {
            "kind": "investigation",
            "priority": tier,
            "rank": rank,
            "risk": int(inv.get("risk_score") or priority_score),
            "reason_it_exists": str(
                purpose.get("why_analyst_should_care")
                or inv.get("reason")
                or purpose.get("what_is_happening")
                or "Clustered evidence indicates actionable risk."
            )[:320],
            "affected_assets": list(inv.get("affected_assets") or [])[:12],
            "affected_identities": affected_identities,
            "evidence_timeline": timeline,
            "evidence": evidence,
            "alternative_explanations": alternative_explanations,
            "analyst_tasks": analyst_tasks,
            "immediate_analyst_actions": [t["action"] for t in analyst_tasks[:6]],
            "why_ranked_here": why_ranked,
            "ranking_explanation": why_ranked.get("headline", ""),
            "confidence_factors": _confidence_factors(members, inv),
            "self_review": {
                "internally_consistent": critique.get("internally_consistent"),
                "could_be_wrong": critique.get("could_be_wrong"),
                "issues": critique.get("issues") or [],
            },
        }
    )
    return out


def build_investigation_queue_status(
    investigations: list[dict[str, Any]],
    confirmed_findings: list[dict[str, Any]],
    *,
    noise_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Explain an empty or partial investigation queue for analysts."""
    count = len(investigations)
    retained = len(confirmed_findings)
    if count > 0:
        urgent = sum(1 for inv in investigations if inv.get("tier") in ("Critical", "High"))
        return {
            "empty": False,
            "count": count,
            "urgent": urgent,
            "retained_findings": retained,
            "headline": f"{count} investigation{'s' if count != 1 else ''} ranked for review",
        }

    reasons: list[str] = []
    if retained == 0:
        reasons.append(
            "No findings passed retention after correlation, deduplication, and false-positive review."
        )
    else:
        high = sum(
            1
            for f in confirmed_findings
            if str(f.get("severity") or "").upper() in ("CRITICAL", "HIGH")
            or int(f.get("severity_rank") or 0) >= 3
        )
        reasons.append(
            f"{retained} finding{'s' if retained != 1 else ''} retained — "
            "clustering did not produce a ranked investigation queue from this evidence set."
        )
        if high:
            reasons.append(
                f"{high} high-severity retained finding{'s' if high != 1 else ''} — review them in Findings below."
            )
        incomplete = sum(1 for f in confirmed_findings if f.get("review_incomplete"))
        if incomplete:
            reasons.append(
                f"{incomplete} finding{'s' if incomplete != 1 else ''} flagged by self-review — validation still required."
            )

    noise_stats = (noise_meta or {}).get("statistics") or {}
    suppressed = int(noise_stats.get("suppressed") or 0)
    if suppressed:
        reasons.append(
            f"{suppressed} additional signal{'s' if suppressed != 1 else ''} suppressed as noise or duplicate."
        )

    return {
        "empty": True,
        "count": 0,
        "urgent": 0,
        "retained_findings": retained,
        "headline": "No ranked investigations from this upload",
        "reasons": reasons[:5],
        "next_step": "Expand Findings below — retained evidence may still require analyst review.",
    }


def _why_ranked_here(
    inv: dict[str, Any],
    *,
    rank: int,
    quality: dict[str, Any],
) -> dict[str, Any]:
    bullets: list[str] = []
    tier = str(inv.get("tier") or "")

    if rank:
        bullets.append(f"Ranked #{rank} in the analyst queue")
    if tier in ("Critical", "High"):
        bullets.append(f"{tier} priority tier from computed risk and evidence strength")

    for reason in (inv.get("priority_reasons") or [])[:5]:
        s = str(reason).strip()
        if s and s not in bullets:
            bullets.append(s)

    if int(quality.get("internet_exposure") or 0) >= 60:
        bullets.append("Internet-reachable or entry-point exposure")
    if int(quality.get("business_impact") or 0) >= 65:
        bullets.append("High business impact score")
    if int(quality.get("exploitability") or 0) >= 65:
        bullets.append("Exploitability signals present in evidence")
    if int(quality.get("blast_radius") or 0) >= 2:
        bullets.append("Multi-asset blast radius if abused")
    if len(inv.get("evidence_sources") or []) >= 2:
        bullets.append("Multiple independent scanners corroborate the cluster")

    if not bullets:
        bullets.append("Retained evidence cluster warrants analyst validation")

    headline = (
        f"This investigation is ranked #{rank} because"
        if rank
        else "This investigation is prioritized because"
    )
    return {"rank": rank, "headline": headline, "bullets": bullets[:8]}


def _affected_identities(
    inv: dict[str, Any],
    members: list[InvestigatedFinding],
) -> list[str]:
    identities: list[str] = []
    ctype = str(inv.get("cluster_type") or "")

    if ctype in ("identity", "credential"):
        for item in members:
            host = str(item.correlated.host or "").strip()
            if host:
                identities.append(host)

    for item in members:
        blob = f"{item.correlated.title} {item.correlated.cve or ''}"
        if _IDENTITY_RE.search(blob):
            label = str(item.correlated.host or item.correlated.title or "").strip()
            if label:
                identities.append(label[:80])

    return _unique_strings(identities)[:8]


def _analyst_tasks(
    inv: dict[str, Any],
    members: list[InvestigatedFinding],
    reasoning: dict[str, Any],
) -> list[dict[str, str]]:
    tasks: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(action: str, why: str, priority: str = "medium") -> None:
        key = action.lower().strip()
        if not key or key in seen:
            return
        seen.add(key)
        tasks.append(
            {
                "action": action.strip(),
                "why": (why or "Closes an evidence gap before asserting compromise.").strip()[:240],
                "priority": priority,
            }
        )

    if inv.get("immediate_action"):
        add(str(inv["immediate_action"]), "Highest-priority validation for this cluster", "high")

    for item in members:
        intel = item.intelligence or {}
        for t in (intel.get("investigation") or {}).get("investigation_tasks") or []:
            add(
                str(t.get("title") or ""),
                str(t.get("rationale") or t.get("evidence_gap") or ""),
                str(t.get("priority") or "medium"),
            )

    for step in reasoning.get("recommended_validation") or []:
        add(str(step), "Recommended validation from reasoning chain")

    for missing in (inv.get("missing_evidence") or [])[:3]:
        add(f"Validate: {missing}", "Listed as missing evidence for this investigation")

    return tasks[:8]


def _evidence_records(
    inv: dict[str, Any],
    members: list[InvestigatedFinding],
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    seen: set[str] = set()

    for row in inv.get("evidence_ledger") or []:
        eid = str(row.get("evidence_id") or "")
        if eid in seen:
            continue
        seen.add(eid)
        records.append(
            {
                "scanner": row.get("scanner") or "unknown",
                "filename": row.get("filename") or "unknown",
                "finding_id": eid,
                "timestamp": row.get("timestamp"),
                "confidence_weight": int(row.get("confidence_weight") or 0),
                "evidence_quality": _evidence_quality_label(int(row.get("confidence_weight") or 0)),
                "summary": row.get("summary") or "",
            }
        )

    if records:
        return records[:16]

    for item in members:
        corr = item.correlated
        val = item.validation
        for raw in corr.findings or []:
            eid = str(raw.id or corr.id)
            if eid in seen:
                continue
            seen.add(eid)
            records.append(
                {
                    "scanner": str(raw.source_tool or "unknown"),
                    "filename": str(raw.source_file or "unknown"),
                    "finding_id": eid,
                    "timestamp": getattr(raw, "timestamp", None),
                    "confidence_weight": int(val.overall_confidence),
                    "evidence_quality": _evidence_quality_label(int(val.overall_confidence)),
                    "summary": str(raw.evidence or raw.title or "")[:160],
                }
            )
    return records[:16]


def _evidence_quality_label(score: int) -> str:
    if score >= 80:
        return "strong"
    if score >= 60:
        return "moderate"
    if score >= 40:
        return "weak"
    return "observational"


def _confidence_factors(
    members: list[InvestigatedFinding],
    inv: dict[str, Any],
) -> list[str]:
    factors: list[str] = []
    sources = inv.get("evidence_sources") or []
    if len(sources) >= 2:
        factors.append(f"{len(sources)} independent scanners agree")
    elif sources:
        factors.append("Single-scanner evidence — corroboration limited")

    for item in members:
        val = item.validation
        if val.cve_applicable:
            factors.append("CVE applicability confirmed in validation")
        if val.reachable:
            factors.append("Reachable from assessed entry point")
        if val.reproducible:
            factors.append("Observation reproduced")
        if val.contradicting_evidence:
            factors.append(f"{len(val.contradicting_evidence)} contradicting signal(s)")

    if inv.get("missing_evidence"):
        factors.append(f"{len(inv['missing_evidence'])} evidence gap(s) remain")

    return _unique_strings(factors)[:8]


def _unique_strings(values: list[Any]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for v in values:
        s = str(v or "").strip()
        if not s or s.lower() in seen:
            continue
        seen.add(s.lower())
        out.append(s)
    return out
