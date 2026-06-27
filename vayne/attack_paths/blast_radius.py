"""Blast radius — what becomes reachable if an attacker owns a node."""

from __future__ import annotations

import networkx as nx

from vayne.attack_paths.asset_criticality import classify_criticality


def reachable_from(g: nx.DiGraph, start: str) -> set[str]:
    if start not in g:
        return set()
    visited: set[str] = set()
    queue = [start]
    while queue:
        node = queue.pop(0)
        for succ in g.successors(node):
            if succ not in visited:
                visited.add(succ)
                queue.append(succ)
    return visited


def blast_radius_for_node(g: nx.DiGraph, node_id: str) -> dict:
    reachable = reachable_from(g, node_id)
    critical: list[tuple[str, str, float]] = []
    for nid in reachable:
        data = g.nodes.get(nid, {})
        cat, weight = classify_criticality(nid, data)
        if weight >= 6.0:
            critical.append((nid, cat, weight))
    return {
        "origin": node_id,
        "reachable_count": len(reachable),
        "critical_targets": len(critical),
        "reachable_nodes": sorted(reachable),
        "critical_categories": sorted({c[1] for c in critical}),
    }


def path_blast_radius(g: nx.DiGraph, path: list[str]) -> dict:
    if not path:
        return {"reachable_count": 0, "critical_targets": 0, "nodes": []}
    union: set[str] = set()
    critical = 0
    for nid in path:
        info = blast_radius_for_node(g, nid)
        union.update(info["reachable_nodes"])
        critical = max(critical, info["critical_targets"])
    return {
        "reachable_count": len(union),
        "critical_targets": critical,
        "nodes": sorted(union),
    }


def annotate_graph_blast_radius(g: nx.DiGraph) -> None:
    for nid in g.nodes:
        info = blast_radius_for_node(g, nid)
        g.nodes[nid]["blast_radius"] = info["reachable_count"]
        g.nodes[nid]["blast_critical_targets"] = info["critical_targets"]
