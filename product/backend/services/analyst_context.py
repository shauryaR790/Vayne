"""Build structured investigation context for the VAYNE LLM analyst layer."""

from __future__ import annotations

import json
from typing import Any

from product.backend.services.investigation_service import InvestigationService

_MAX_EVIDENCE = 280
_MAX_PROOF = 3500
_MAX_FINDINGS = 24
_MAX_REJECTED = 12
_MAX_PATHS = 8
_MAX_REMEDIATION = 16


def _clip(text: str | None, limit: int = _MAX_EVIDENCE) -> str:
    if not text:
        return ""
    t = str(text).strip()
    return t if len(t) <= limit else f"{t[: limit - 1]}…"


def _finding_row(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": raw.get("id") or raw.get("title", ""),
        "title": _clip(str(raw.get("title") or ""), 120),
        "host": raw.get("host") or raw.get("asset") or "",
        "classification": raw.get("classification") or raw.get("severity") or "",
        "confidence": raw.get("confidence"),
        "cve": raw.get("cve") or raw.get("cve_id"),
        "evidence": _clip(str(raw.get("evidence") or raw.get("description") or "")),
    }


def _path_row(raw: dict[str, Any]) -> dict[str, Any]:
    story = raw.get("attack_story") or {}
    if isinstance(story, str):
        story = {"narrative": story}
    conf = raw.get("confidence") or {}
    risk = raw.get("risk") or {}
    return {
        "id": raw.get("id") or raw.get("stable_id"),
        "stable_id": raw.get("stable_id"),
        "title": _clip(str(raw.get("title") or story.get("narrative") or ""), 160),
        "confidence": conf.get("score") if isinstance(conf, dict) else conf,
        "risk": risk.get("score") if isinstance(risk, dict) else risk,
        "category": raw.get("attack_category") or raw.get("category"),
        "blast_radius": raw.get("blast_radius"),
        "mitre_tactics": (raw.get("mitre_tactics") or [])[:6],
        "attack_story": {
            k: _clip(str(v), 200)
            for k, v in story.items()
            if v and k in (
                "initial_foothold",
                "exploitation_step",
                "privilege_gained",
                "lateral_movement",
                "target_reached",
                "business_impact",
                "narrative",
            )
        },
    }


def _rejected_chains(graph_proof: dict[str, Any]) -> list[dict[str, str]]:
    chains: list[dict[str, str]] = []
    discovery = graph_proof.get("path_discovery") or {}
    proofs = discovery.get("rejected_path_proofs") or []
    for proof in proofs[:_MAX_REJECTED]:
        path = proof.get("path") or proof.get("title") or ""
        if isinstance(path, list):
            steps = " → ".join(str(s) for s in path)
        else:
            steps = str(path).replace(",", " → ")
        chains.append(
            {
                "steps": _clip(steps, 160),
                "reason": _clip(str(proof.get("reason") or proof.get("reject_reason") or ""), 200),
            }
        )
    for edge in (graph_proof.get("rejected_edges") or [])[: max(0, _MAX_REJECTED - len(chains))]:
        src = str(edge.get("source", "")).split("/")[-1].split("@")[0]
        tgt = str(edge.get("target", "")).split("/")[-1].split("@")[0]
        chains.append(
            {
                "steps": f"{src} → {tgt}",
                "reason": _clip(
                    str(edge.get("reject_reason") or edge.get("rejection_reason") or ""),
                    200,
                ),
            }
        )
    return chains


def _proof_timeline(report: dict[str, Any], graph: dict[str, Any]) -> list[dict[str, str]]:
    stats = report.get("stats") or {}
    gp = report.get("graph_proof") or {}
    discovery = gp.get("path_discovery") or {}
    nodes = graph.get("nodes") or gp.get("nodes") or []
    node_count = len(nodes) if isinstance(nodes, list) else 0

    return [
        {
            "phase": "Discovery",
            "detail": f"{node_count} graph nodes from source evidence",
        },
        {
            "phase": "Fingerprinting",
            "detail": f"{len(report.get('assets') or [])} assets fingerprinted",
        },
        {
            "phase": "Vulnerability Mapping",
            "detail": (
                f"{stats.get('observed', 0)} observed · "
                f"{stats.get('likely_exploitable', 0)} likely exploitable · "
                f"{stats.get('confirmed', 0)} confirmed"
            ),
        },
        {
            "phase": "Attack Path Generation",
            "detail": f"{discovery.get('paths_explored') or stats.get('paths_explored') or stats.get('attack_paths', 0)} paths explored",
        },
        {
            "phase": "Validation",
            "detail": (
                f"{stats.get('attack_paths', 0)} verified · "
                f"{stats.get('paths_rejected', 0)} rejected"
            ),
        },
        {
            "phase": "Final Verdict",
            "detail": (
                f"{report.get('attack_surface_classification', '')} · "
                f"score {report.get('attack_surface_score', 0)}/100"
            ),
        },
    ]


def _count_services(assets: list[dict[str, Any]]) -> int:
    ports: set[str] = set()
    for asset in assets:
        pt = asset.get("port_technologies") or {}
        if isinstance(pt, dict):
            ports.update(str(k) for k in pt.keys())
    return len(ports)


def _count_software(assets: list[dict[str, Any]]) -> int:
    sw: set[str] = set()
    for asset in assets:
        for t in asset.get("technologies") or []:
            if t:
                sw.add(str(t))
    return len(sw)


def build_analyst_context(svc: InvestigationService, inv_id: str) -> dict[str, Any]:
    """Structured context object injected before every LLM response."""
    report = svc.get_report_view(inv_id) or {}
    findings = svc.get_findings_export(inv_id)
    graph = svc.get_full_graph(inv_id)
    remediation = svc.get_remediation_export(inv_id)
    paths_export = svc.get_attack_paths_export(inv_id)

    stats = report.get("stats") or {}
    assets = report.get("assets") or []
    gp = report.get("graph_proof") or {}
    graph_stats = graph.get("statistics") or {}

    proof_path = svc.export_dir(inv_id) / "proof.txt"
    proof_excerpt = ""
    if proof_path.exists():
        proof_excerpt = _clip(proof_path.read_text(encoding="utf-8", errors="replace"), _MAX_PROOF)

    validated = [_finding_row(f) for f in (findings.get("validated") or [])[:_MAX_FINDINGS]]
    rejected = [_finding_row(f) for f in (findings.get("rejected") or [])[:_MAX_REJECTED]]

    attack_paths = [_path_row(p) for p in paths_export[:_MAX_PATHS]]
    rejected_paths = _rejected_chains(gp if isinstance(gp, dict) else {})

    recommendations = []
    for item in (remediation.get("items") or [])[:_MAX_REMEDIATION]:
        recommendations.append(
            {
                "fix": _clip(str(item.get("fix") or item.get("title") or ""), 200),
                "difficulty": item.get("difficulty"),
                "risk_reduction": item.get("risk_reduction") or item.get("confidence_reduction"),
                "affected_paths": (item.get("affected_paths") or item.get("paths") or [])[:4],
            }
        )

    avg_conf = None
    if attack_paths:
        scores = [p["confidence"] for p in attack_paths if p.get("confidence") is not None]
        if scores:
            avg_conf = round(sum(float(s) for s in scores) / len(scores), 1)

    # Analyst-first workbench slice — confidence factors, proof, missing evidence.
    workbench_slice: dict[str, Any] = {}
    try:
        wb = svc.get_workbench(inv_id) or {}
        top_findings = []
        for f in (wb.get("confirmed_findings") or [])[:6]:
            sem = f.get("confidence") or {}
            top_findings.append(
                {
                    "title": f.get("title"),
                    "host": f.get("host"),
                    "status": f.get("status"),
                    "confidence": f.get("machine_confidence"),
                    "semantic_confidence": sem,
                    "multi_dimensional_confidence": {
                        "observation": (sem.get("observation") or {}).get("score"),
                        "reliability": (sem.get("reliability") or {}).get("score"),
                        "exploit": (sem.get("exploit") or {}).get("score"),
                        "impact": (sem.get("impact") or {}).get("score"),
                        "overall": sem.get("overall"),
                    },
                    "base_confidence": f.get("base_confidence"),
                    "final_confidence": f.get("final_confidence"),
                    "confidence_factors": f.get("confidence_factors") or [],
                    "proof": f.get("proof") or [],
                    "scanner_agreement": f.get("scanner_agreement"),
                    "business_impact": f.get("business_impact_detail") or f.get("business_impact"),
                    # Phase 2 engine intelligence — the narrator explains these.
                    "analyst_reasoning": f.get("reasoning") or [],
                    "recommendations": f.get("recommendations") or [],
                    "conflicts": f.get("conflicts_detail") or [],
                    "confidence_timeline": f.get("confidence_timeline") or [],
                    "service_profile": f.get("service_profile") or {},
                }
            )
        workbench_slice = {
            "executive_summary": wb.get("executive_summary"),
            "confirmed_findings": top_findings,
            "missing_evidence": (wb.get("missing_evidence") or wb.get("unknowns") or [])[:8],
            "candidate_paths": (wb.get("candidate_paths") or [])[:8],
            "investigation_timeline": wb.get("investigation_timeline") or [],
            "next_actions": (wb.get("next_actions") or [])[:6],
        }
    except Exception:
        workbench_slice = {}

    return {
        "investigation_summary": {
            "id": inv_id,
            "name": report.get("name") or "",
            "target": report.get("target") or "",
            "duration_seconds": float(report.get("duration_seconds") or 0),
            "assets": len(assets),
            "services": _count_services(assets),
            "software": _count_software(assets),
            "validated_findings": int(stats.get("findings_retained") or len(validated)),
            "rejected_findings": len(findings.get("rejected") or []),
            "verified_attack_paths": int(stats.get("attack_paths") or len(attack_paths)),
            "rejected_attack_paths": int(stats.get("paths_rejected") or len(rejected_paths)),
            "paths_explored": stats.get("paths_explored") or stats.get("attack_paths"),
            "engine_note": (
                "The deterministic VAYNE engine performed this investigation. "
                "You explain its outputs only — never invent evidence."
            ),
        },
        "investigation": {
            "id": inv_id,
            "name": report.get("name") or "",
            "target": report.get("target") or "",
            "duration_seconds": float(report.get("duration_seconds") or 0),
            "assets": len(assets),
            "services": _count_services(assets),
            "software": _count_software(assets),
            "validated_findings": int(stats.get("findings_retained") or len(validated)),
            "rejected_findings": len(findings.get("rejected") or []),
            "verified_attack_paths": int(stats.get("attack_paths") or len(attack_paths)),
            "rejected_attack_paths": int(stats.get("paths_rejected") or len(rejected_paths)),
            "paths_explored": stats.get("paths_explored") or stats.get("attack_paths"),
            "risk_score": report.get("attack_surface_score"),
            "risk_classification": report.get("attack_surface_classification"),
            "average_path_confidence": avg_conf,
            "engine_note": (
                "The deterministic VAYNE engine performed this investigation. "
                "You explain its outputs only — never invent evidence."
            ),
        },
        "validated_findings": validated,
        "rejected_findings": rejected,
        "attack_paths": attack_paths,
        "rejected_paths": rejected_paths,
        "rejected_attack_paths": rejected_paths,
        "confidence_scores": {
            "average_path_confidence": avg_conf,
            "findings": [
                {"id": f["id"], "confidence": f.get("confidence")}
                for f in validated[:12]
                if f.get("confidence") is not None
            ],
            "paths": [
                {"id": p.get("stable_id") or p.get("id"), "confidence": p.get("confidence")}
                for p in attack_paths
                if p.get("confidence") is not None
            ],
        },
        "risk_scores": {
            "attack_surface_score": report.get("attack_surface_score"),
            "attack_surface_classification": report.get("attack_surface_classification"),
            "paths": [
                {"id": p.get("stable_id") or p.get("id"), "risk": p.get("risk")}
                for p in attack_paths
                if p.get("risk") is not None
            ],
        },
        "business_impact": [
            {
                "path_id": p.get("stable_id") or p.get("id"),
                "blast_radius": p.get("blast_radius"),
                "narrative": (p.get("attack_story") or {}).get("business_impact"),
            }
            for p in attack_paths[:4]
            if p.get("blast_radius") or (p.get("attack_story") or {}).get("business_impact")
        ],
        "remediation": recommendations,
        "recommendations": recommendations,
        "proof_timeline": _proof_timeline(report, graph),
        "proof_excerpt": proof_excerpt,
        "graph_summary": {
            "node_count": len(graph.get("nodes") or []),
            "edge_count": len(graph.get("edges") or []),
            **{k: graph_stats[k] for k in graph_stats if k in (
                "hosts",
                "services",
                "vulnerabilities",
                "exploit_nodes",
                "credential_nodes",
            )},
        },
        "graph_statistics": {
            "node_count": len(graph.get("nodes") or []),
            "edge_count": len(graph.get("edges") or []),
            **{k: graph_stats[k] for k in graph_stats if k in (
                "hosts",
                "services",
                "vulnerabilities",
                "exploit_nodes",
                "credential_nodes",
            )},
        },
        "workbench": workbench_slice,
    }


def pack_prompt_context(context: dict[str, Any]) -> dict[str, Any]:
    """Structured context object injected before every LLM response."""
    return {
        "investigation_summary": context.get("investigation_summary") or context.get("investigation"),
        "validated_findings": context.get("validated_findings") or [],
        "rejected_findings": context.get("rejected_findings") or [],
        "attack_paths": context.get("attack_paths") or [],
        "rejected_paths": context.get("rejected_paths") or context.get("rejected_attack_paths") or [],
        "confidence_scores": context.get("confidence_scores") or {},
        "risk_scores": context.get("risk_scores") or {},
        "business_impact": context.get("business_impact") or [],
        "remediation": context.get("remediation") or context.get("recommendations") or [],
        "proof_timeline": context.get("proof_timeline") or [],
        "graph_summary": context.get("graph_summary") or context.get("graph_statistics") or {},
        "workbench": context.get("workbench") or {},
    }


def context_as_json(context: dict[str, Any]) -> str:
    return json.dumps(context, ensure_ascii=False, separators=(",", ":"))
