"""Deterministic attack-path classifier (Phase H).

Public API:

    classify_attack_path(graph, path, path_confidence=0)
        -> (category, proof_dict, tactics, techniques)

Classification uses structural signatures only — no LLM, ML, or keyword scoring.
"""

from __future__ import annotations

import networkx as nx

from vayne.attack_paths.classification.mitre import mitre_for_category
from vayne.attack_paths.classification.proof import AttackCategoryProof
from vayne.attack_paths.classification.signatures import PathContext, _MATCHERS
from vayne.models.attack_categories import AttackCategory


def _host_key(nid: str, data: dict) -> str:
    if data.get("node_type") == "asset":
        return data.get("label", nid)
    if nid.startswith("asset:"):
        return nid.split(":", 1)[1]
    return ""


def build_path_context(g: nx.DiGraph, path: list[str]) -> PathContext:
    node_types: set[str] = set()
    capabilities: list[str] = []
    cap_seen: set[str] = set()
    node_labels: dict[str, str] = {}
    node_ids_by_type: dict[str, list[str]] = {}
    verified_exploit = False
    hosts: set[str] = set()

    for nid in path:
        data = g.nodes[nid]
        nt = data.get("node_type", "")
        node_types.add(nt)
        node_labels[nid] = data.get("label", nid)
        node_ids_by_type.setdefault(nt, []).append(nid)

        cap = data.get("capability", "")
        if cap and cap not in cap_seen:
            capabilities.append(cap)
            cap_seen.add(cap)

        status = data.get("applicability_status", "")
        if status == "verified" or nid.startswith("cve_verified:") or nid.startswith("access:"):
            verified_exploit = True

        hk = _host_key(nid, data)
        if hk:
            hosts.add(hk)

    edge_relationships: list[str] = []
    edge_artifact_types: set[str] = set()
    access_outcome = False

    for u, v in zip(path[:-1], path[1:]):
        ed = g.edges[u, v]
        rel = ed.get("relationship", "")
        if rel:
            edge_relationships.append(rel)
        art = ed.get("artifact_type", "")
        if art:
            edge_artifact_types.add(art)
        if art == "access_outcome" or rel == "yields_access":
            access_outcome = True

        ecap = ed.get("capability", "")
        if ecap and ecap not in cap_seen:
            capabilities.append(ecap)
            cap_seen.add(ecap)

    return PathContext(
        path=list(path),
        node_types=node_types,
        capabilities=capabilities,
        capability_set=cap_seen,
        edge_relationships=edge_relationships,
        edge_relationship_set=set(edge_relationships),
        edge_artifact_types=edge_artifact_types,
        node_labels=node_labels,
        node_ids_by_type=node_ids_by_type,
        verified_exploit=verified_exploit,
        access_outcome=access_outcome,
        distinct_hosts=len(hosts),
    )


def classify_attack_path(
    graph: nx.DiGraph,
    path: list[str],
    path_confidence: int = 0,
) -> tuple[str, dict, list[str], list[str]]:
    """Classify one validated attack path.

    Returns:
        category value (str)
        attack_category_proof (dict)
        mitre_tactics
        mitre_techniques
    """
    ctx = build_path_context(graph, path)

    for matcher in _MATCHERS:
        result = matcher(ctx)
        if result is not None:
            proof = AttackCategoryProof(
                category=result.category.value,
                matched_rules=[result.rule_id],
                matched_nodes=result.matched_nodes,
                matched_capabilities=result.matched_capabilities,
                matched_edges=result.matched_edges,
                confidence=path_confidence,
                explanation=result.explanation,
            )
            tactics, techniques = mitre_for_category(result.category)
            return result.category.value, proof.to_dict(), tactics, techniques

    proof = AttackCategoryProof(
        category=AttackCategory.UNKNOWN.value,
        matched_rules=["no_structural_signature"],
        matched_nodes=[ctx.node_labels.get(n, n) for n in path[:3]],
        matched_capabilities=ctx.capabilities,
        confidence=path_confidence,
        explanation=["no deterministic signature matched path structure"],
    )
    tactics, techniques = mitre_for_category(AttackCategory.UNKNOWN)
    return AttackCategory.UNKNOWN.value, proof.to_dict(), tactics, techniques
