"""Engine-native analyst investigation generation (Rules 1–8, 13–16).

Evidence graph → noise filter → cluster → enrich (purpose, reasoning, quality,
ledger, timeline, self-critique) → analyst investigations ready for export.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from vayne.attack_paths.proof import GraphProof
from vayne.investigation.clustering import build_investigation_clusters
from vayne.investigation.confidence_bridge import apply_confidence_bridge
from vayne.investigation.contract import finalize_investigation, finalize_investigation_list
from vayne.investigation.noise_filter import filter_investigated_findings
from vayne.investigation.quality_score import composite_priority_score, compute_quality_score
from vayne.investigation.reasoning_chain import build_reasoning_chain
from vayne.investigation.self_critique import run_investigation_self_critique
from vayne.models import AttackPath, Classification, InvestigatedFinding, InvestigationReport

_CHECK_LABELS: list[tuple[str, str]] = [
    ("host_alive", "Host alive"),
    ("port_open", "Port open"),
    ("service_exists", "Service present"),
    ("service_fingerprinted", "Service fingerprint"),
    ("version_matches", "Version matched"),
    ("cve_applicable", "CVE matched"),
    ("reachable", "Reachable from entry point"),
    ("reproducible", "Response reproduced"),
    ("privilege_escalation_possible", "Privilege escalation"),
    ("lateral_movement_possible", "Lateral movement"),
]


def build_analyst_investigations(
    report: InvestigationReport,
    graph_proof: GraphProof | None = None,
    *,
    ledger: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Generate cluster-level analyst investigations from the evidence graph."""
    ledger = ledger or {}
    ledger_by_finding = {
        str(e.get("finding_id") or ""): e for e in (ledger.get("entries") or [])
    }

    filtered, noise_meta = filter_investigated_findings(report.findings)
    finding_dicts = [_investigated_to_cluster_dict(item) for item in filtered]
    member_lookup = {item.correlated.id: item for item in filtered}

    candidate_paths = _candidate_paths(report.attack_paths, graph_proof)
    # Alternate hypotheses stay inside per-finding reasoning — never become queue items.
    hypotheses: list[dict[str, Any]] = []

    clusters = build_investigation_clusters(
        confirmed_findings=finding_dicts,
        candidate_paths=candidate_paths,
        hypotheses=hypotheses,
    )

    investigations: list[dict[str, Any]] = []
    enrich_errors: list[str] = []
    for cluster in clusters:
        members = [
            member_lookup[fid]
            for fid in cluster.get("finding_ids") or []
            if fid in member_lookup
        ]
        try:
            enriched = _enrich_cluster(
                cluster,
                members=members,
                attack_paths=report.attack_paths,
                ledger_by_finding=ledger_by_finding,
            )
            investigations.append(enriched)
        except Exception as exc:  # noqa: BLE001 — keep clustering alive if one enrich fails
            enrich_errors.append(f"{cluster.get('id')}: {exc}")
            investigations.append(dict(cluster))

    investigations.sort(
        key=lambda x: (
            {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}.get(str(x.get("tier")), 9),
            -int(x.get("priority_score") or 0),
        )
    )

    finalized: list[dict[str, Any]] = []
    for rank, inv in enumerate(investigations[:12], start=1):
        members = [
            member_lookup[fid]
            for fid in inv.get("finding_ids") or []
            if fid in member_lookup
        ]
        finalized.append(finalize_investigation(inv, rank=rank, members=members))
    investigations = finalized

    if not investigations and finding_dicts:
        from vayne.investigation.clustering import build_findings_fallback_investigations

        investigations = finalize_investigation_list(
            build_findings_fallback_investigations(finding_dicts)
        )

    payload: dict[str, Any] = {
        "investigations": investigations,
        "count": len(investigations[:12]),
        "noise_filter": noise_meta,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "engine_version": "analyst_investigations_v1",
    }
    if enrich_errors:
        payload["enrich_errors"] = enrich_errors[:8]
    return payload


def _enrich_cluster(
    cluster: dict[str, Any],
    *,
    members: list[InvestigatedFinding],
    attack_paths: list[AttackPath],
    ledger_by_finding: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    quality = compute_quality_score(
        members=members,
        attack_paths=attack_paths,
        cluster_type=str(cluster.get("cluster_type") or "asset"),
    )
    priority = composite_priority_score(quality)
    reasoning = build_reasoning_chain(
        members=members,
        cluster=cluster,
        attack_paths=attack_paths,
    )
    critique = run_investigation_self_critique(cluster, members)
    if critique.get("confidence_adjustment"):
        priority = max(0, priority + int(critique["confidence_adjustment"]))
        cluster["confidence"] = max(
            0, int(cluster.get("confidence") or 0) + int(critique["confidence_adjustment"])
        )

    purpose = _investigation_purpose(cluster, members, reasoning)
    timeline = _investigation_timeline(members, cluster)
    ledger_refs = _ledger_refs(members, ledger_by_finding)
    next_actions = _next_best_actions(members, cluster, reasoning)
    business = _executive_business_impact(cluster, members)

    out = dict(cluster)
    executive_line = (
        business.get("customers")
        or business.get("brand")
        or business.get("operations")
        or ""
    )
    out.update(
        {
            "kind": "investigation",
            "priority_score": priority,
            "quality_score": quality,
            "purpose": purpose,
            "reasoning_chain": reasoning,
            "self_critique": critique,
            "evidence_ledger": ledger_refs,
            "timeline": timeline,
            "business_impact_executive": business,
            "next_best_actions": next_actions,
            "work_remaining": purpose.get("work_remaining") or [],
            "child_count": len(members),
            "reason": purpose.get("why_analyst_should_care") or cluster.get("reason"),
            "business_impact": executive_line or cluster.get("business_impact"),
            "confidence_explanation": _analyst_confidence_note(cluster, members),
        }
    )
    return out


def _analyst_confidence_note(
    cluster: dict[str, Any],
    members: list[InvestigatedFinding],
) -> str:
    sources = cluster.get("evidence_sources") or []
    if len(sources) >= 2:
        return (
            f"{len(sources)} scanners agree — validate before treating this as confirmed compromise."
        )
    conf = int(cluster.get("confidence") or 0)
    if any(m.validation.cve_applicable for m in members):
        return f"CVE applicability flagged at {conf}% — reproduction still required."
    return f"{conf}% confidence from available evidence — manual validation recommended."


def _investigation_purpose(
    cluster: dict[str, Any],
    members: list[InvestigatedFinding],
    reasoning: dict[str, Any],
) -> dict[str, Any]:
    supporting: list[str] = list(cluster.get("evidence_items") or [])[:6]
    contradicting = list(reasoning.get("contradictions") or [])[:4]
    missing = list(cluster.get("missing_evidence") or [])[:4]
    for item in members:
        for m in item.validation.missing_evidence or []:
            s = str(m).strip()
            if s and s not in missing:
                missing.append(s)

    assets: list[str] = []
    for item in members:
        h = str(item.correlated.host or "").strip()
        if h and h not in assets:
            assets.append(h)

    return {
        "what_is_happening": str(cluster.get("title") or "Clustered security risk"),
        "why_analyst_should_care": str(cluster.get("reason") or cluster.get("priority_reasons", [""])[0]),
        "how_attacker_could_abuse": str(reasoning.get("most_likely_explanation") or ""),
        "business_systems_affected": assets[:8],
        "evidence_supporting": supporting,
        "evidence_contradicting": contradicting,
        "work_remaining": missing[:6],
    }


def _investigation_timeline(
    members: list[InvestigatedFinding],
    cluster: dict[str, Any],
) -> dict[str, Any]:
    first_seen: list[str] = []
    last_seen: list[str] = []
    confidence_events: list[dict[str, Any]] = []

    for item in members:
        corr = item.correlated
        for raw in corr.findings or []:
            ts = getattr(raw, "timestamp", None) or getattr(raw, "discovered_at", None)
            if ts:
                s = str(ts)
                first_seen.append(s)
                last_seen.append(s)
        intel = item.intelligence or {}
        for step in intel.get("timeline") or []:
            if isinstance(step, dict):
                confidence_events.append(step)

    return {
        "first_seen": min(first_seen) if first_seen else None,
        "last_seen": max(last_seen) if last_seen else None,
        "evidence_added": [str(cluster.get("title") or "")],
        "confidence_changed": confidence_events[:8],
        "risk_changed": cluster.get("priority_reasons") or [],
    }


def _ledger_refs(
    members: list[InvestigatedFinding],
    ledger_by_finding: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in members:
        entry = ledger_by_finding.get(item.correlated.id)
        if not entry:
            continue
        for row in entry.get("contributions") or []:
            key = f"{row.get('source_file')}|{row.get('finding_id')}"
            if key in seen:
                continue
            seen.add(key)
            refs.append(
                {
                    "scanner": row.get("source_tool") or "unknown",
                    "filename": row.get("source_file") or "unknown",
                    "timestamp": row.get("timestamp"),
                    "evidence_id": row.get("finding_id") or item.correlated.id,
                    "confidence_weight": item.validation.overall_confidence,
                    "summary": (row.get("evidence") or row.get("title") or "")[:160],
                }
            )
    return refs[:12]


def _next_best_actions(
    members: list[InvestigatedFinding],
    cluster: dict[str, Any],
    reasoning: dict[str, Any],
) -> list[str]:
    actions: list[str] = []
    if cluster.get("immediate_action"):
        actions.append(str(cluster["immediate_action"]))
    for task in reasoning.get("recommended_validation") or []:
        s = str(task).strip()
        if s and s not in actions:
            actions.append(s)
    for item in members:
        inv = (item.intelligence or {}).get("investigation") or {}
        for t in inv.get("investigation_tasks") or []:
            title = str(t.get("title") or "").strip()
            if title and title not in actions:
                actions.append(title)
    return actions[:8]


def _executive_business_impact(
    cluster: dict[str, Any],
    members: list[InvestigatedFinding],
) -> dict[str, Any]:
    """Translate technical cluster into money/compliance/operations framing (Rule 14)."""
    ctype = str(cluster.get("cluster_type") or "")
    tier = str(cluster.get("tier") or "Medium")

    money = "Potential revenue impact if customer-facing services are compromised."
    compliance = "May trigger audit findings if exploitable paths reach regulated data."
    operations = "Could disrupt production workloads or extend incident response time."
    customers = "Customer trust erodes if external entry points lead to data exposure."
    downtime = "Validated chains often precede outage or ransomware deployment."
    legal = "Breach notification obligations increase when identity or PII paths exist."
    brand = "Public disclosure risk rises for internet-exposed abuse chains."

    for item in members:
        bi = (item.intelligence or {}).get("business_impact") or {}
        narrative = str(bi.get("narrative") or bi.get("summary") or "").lower()
        if "customer" in narrative or "internet" in narrative:
            customers = "Direct customer-facing exposure — prioritize before routine patching."
        if "credential" in narrative or "identity" in narrative:
            legal = "Identity compromise expands breach scope and notification requirements."
        if "database" in narrative or "pii" in narrative:
            compliance = "Regulated data stores appear in blast radius — compliance review required."

    if ctype in ("identity", "credential"):
        legal = "Domain or credential compromise — assume breach notification planning."
        brand = "Credential theft often precedes public ransomware events."
    if ctype == "cloud":
        compliance = "Public cloud misconfiguration can violate data residency controls."
        money = "Cloud egress or crypto-mining abuse drives direct cost overruns."

    return {
        "money": money,
        "compliance": compliance,
        "operations": operations,
        "customers": customers,
        "downtime": downtime,
        "legal": legal,
        "brand": brand,
        "tier": tier,
        "summary": str(cluster.get("business_impact") or "")[:240],
    }


def _investigated_to_cluster_dict(item: InvestigatedFinding) -> dict[str, Any]:
    corr = item.correlated
    val = item.validation
    intel = item.intelligence or {}
    inv = intel.get("investigation") or {}
    bi = intel.get("business_impact") or {}

    validated, not_validated = _checklists(val)
    classification = str(
        val.classification.value if hasattr(val.classification, "value") else val.classification
    )
    exploit_confirmed = str(getattr(val, "exploitability_status", "") or "") == "confirmed"
    if exploit_confirmed:
        claim = "confirmed"
    elif classification.upper() in ("CONFIRMED", "LIKELY EXPLOITABLE"):
        claim = "suspected"
    elif classification.upper() == "OBSERVED":
        claim = "observed"
    else:
        claim = "needs_validation"

    evidence: list[str] = []
    for raw in corr.findings or []:
        snippet = (raw.evidence or raw.description or raw.title or "")[:160]
        if snippet:
            evidence.append(snippet)

    return {
        "id": corr.id,
        "title": corr.title,
        "host": corr.host,
        "severity": corr.severity,
        "machine_confidence": int(val.overall_confidence),
        "base_confidence": int(val.overall_confidence),
        "final_confidence": int(val.overall_confidence),
        "classification": classification,
        "claim_status": claim,
        "cve": corr.cve,
        "sources": list(corr.sources or []),
        "validated_checks": validated,
        "not_validated_checks": not_validated,
        "evidence": evidence[:6],
        "business_impact_detail": {
            "summary": str(bi.get("summary") or bi.get("narrative") or "")[:220],
        },
        "confidence": {"kind": _finding_kind(corr, val)},
        "investigation": inv if not inv.get("deferred") else {},
        "why_it_matters": str(bi.get("attacker_gains") or bi.get("summary") or ""),
    }


def _checklists(validation: Any) -> tuple[list[str], list[str]]:
    validated: list[str] = []
    not_validated: list[str] = []
    for key, label in _CHECK_LABELS:
        if getattr(validation, key, False):
            validated.append(label)
        else:
            not_validated.append(label)
    return validated, not_validated


def _finding_kind(corr: Any, val: Any) -> str:
    if corr.cve:
        return "correlated_vulnerability"
    if val.classification in (Classification.CONFIRMED, Classification.LIKELY_EXPLOITABLE):
        return "validated_exposure"
    return "service_observation"


def _candidate_paths(
    paths: list[AttackPath],
    graph_proof: GraphProof | None,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for p in paths:
        steps = [str(n.label or n.id) for n in p.nodes if n]
        out.append(
            {
                "steps": [s for s in steps if s],
                "status": "VALIDATED",
                "confidence": int(p.confidence or 0),
                "risk": float(p.risk_score or 0) / 10.0 if p.risk_score else 0.0,
                "title": p.title,
            }
        )
    if graph_proof and graph_proof.path_discovery:
        pd = graph_proof.path_discovery
        for reason in (pd.rejected_path_reasons or [])[:4]:
            out.append(
                {
                    "steps": ["internet", "candidate path"],
                    "status": "REJECTED",
                    "confidence": 0,
                    "risk": 0.0,
                    "rejection_reason": str(reason),
                }
            )
    return out


def _hypotheses_from_findings(findings: list[InvestigatedFinding]) -> list[dict[str, Any]]:
    hyps: list[dict[str, Any]] = []
    for item in findings:
        inv = (item.intelligence or {}).get("investigation") or {}
        for h in inv.get("hypotheses") or []:
            if h.get("category") == "primary":
                continue
            hyps.append(
                {
                    "title": h.get("label") or h.get("title") or "Alternate hypothesis",
                    "reason": h.get("rationale") or h.get("description") or "",
                    "confidence": int(h.get("confidence") or 40),
                    "required_validation": h.get("validation_required") or "",
                    "current_evidence": h.get("supporting_evidence") or "",
                }
            )
    return hyps[:6]


def bridge_finding_validation(item: InvestigatedFinding) -> InvestigatedFinding:
    """Apply confidence bridge to a finding after full investigation (Rule 9)."""
    intel = item.intelligence or {}
    inv = intel.get("investigation") or {}
    if inv.get("deferred"):
        return item
    bridged = apply_confidence_bridge(
        item.validation,
        inv.get("self_challenge"),
        inv.get("validation_loop"),
    )
    intel = dict(intel)
    conf = dict(intel.get("confidence") or {})
    conf.update(
        {
            "overall": bridged.overall_confidence,
            "exploit": bridged.exploit_confidence,
            "factors": bridged.confidence_factors,
            "missing_evidence": bridged.missing_evidence,
            "contradicting_evidence": bridged.contradicting_evidence,
        }
    )
    intel["confidence"] = conf
    return item.model_copy(update={"validation": bridged, "intelligence": intel})
