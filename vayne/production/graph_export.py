"""Frontend-ready graph export (Phase I)."""

from __future__ import annotations

from vayne.attack_paths.proof import GraphProof
from vayne.models import AttackPath, InvestigationReport

# Deterministic layer assignment by node type.
_LAYER: dict[str, int] = {
    "endpoint": 0,
    "asset": 1,
    "service": 2,
    "software": 3,
    "vulnerability": 4,
    "identity": 5,
    "credential": 5,
    "database": 6,
    "data": 6,
}


def _position_hint(node_id: str, node_type: str, index: int) -> dict:
    layer = _LAYER.get(node_type, 3)
    return {"layer": layer, "index": index, "x_hint": layer * 120, "y_hint": index * 40}


def export_graph_json(
    report: InvestigationReport,
    graph_proof: GraphProof | None,
) -> dict:
    path_by_terminal: dict[str, AttackPath] = {}
    for p in report.attack_paths:
        if p.nodes:
            path_by_terminal[p.nodes[-1].id] = p

    nodes: list[dict] = []
    edges: list[dict] = []

    if graph_proof:
        for i, n in enumerate(graph_proof.nodes):
            matched = next(
                (p for p in report.attack_paths if any(nd.id == n.id for nd in p.nodes)),
                None,
            )
            nodes.append({
                "id": n.id,
                "label": n.label,
                "type": n.node_type,
                "confidence": matched.confidence if matched else 0,
                "risk": matched.risk_score if matched else 0.0,
                "criticality": matched.terminal_criticality if matched else "",
                "blast_radius": matched.blast_radius if matched else 0,
                "category": matched.attack_category if matched else "",
                "mitre": matched.mitre_tactics if matched else [],
                "evidence": n.evidence,
                "finding_ids": n.finding_ids,
                "group": n.node_type,
                "position_hint": _position_hint(n.id, n.node_type, i),
            })

        for e in graph_proof.edges:
            if not e.accepted:
                continue
            edges.append({
                "source": e.source,
                "target": e.target,
                "confidence": e.confidence,
                "relationship": e.relationship,
                "proof": e.confidence_proof,
                "category": e.artifact_type or e.relationship,
                "evidence": e.evidence,
                "evidence_tier": e.evidence_tier,
            })

    attack_paths_summary = [
        {
            "id": p.id,
            "attack_category": p.attack_category,
            "confidence": p.confidence,
            "risk": p.risk_score,
            "mitre_tactics": p.mitre_tactics,
            "mitre_techniques": p.mitre_techniques,
            "confidence_proof": p.confidence_proof,
            "risk_proof": p.risk_proof,
            "blast_radius": p.blast_radius,
        }
        for p in report.attack_paths
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "attack_paths": attack_paths_summary,
        "statistics": graph_proof.graph_statistics.model_dump() if graph_proof and graph_proof.graph_statistics else {},
    }


def export_attack_paths_json(report: InvestigationReport) -> list[dict]:
    import hashlib

    items = []
    for p in report.attack_paths:
        stable_id = hashlib.sha256(
            ":".join(n.id for n in p.nodes).encode()
        ).hexdigest()[:12]
        items.append({
            "id": p.id,
            "stable_id": stable_id,
            "title": p.title,
            "attack_category": p.attack_category,
            "confidence": p.confidence,
            "risk": p.risk_score,
            "blast_radius": p.blast_radius,
            "attacker_effort": p.attacker_effort,
            "mitre_tactics": p.mitre_tactics,
            "mitre_techniques": p.mitre_techniques,
            "confidence_proof": p.confidence_proof,
            "risk_proof": p.risk_proof,
            "attack_category_proof": p.attack_category_proof,
            "accepted_proof": p.accepted_proof,
            "attack_story": p.attack_story,
            "capability_chain": p.capability_chain,
            "nodes": [n.model_dump(mode="json") for n in p.nodes],
            "edges": [e.model_dump(mode="json") for e in p.edges],
        })
    return items
