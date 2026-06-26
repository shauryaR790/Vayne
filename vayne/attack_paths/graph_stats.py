"""Graph topology statistics for proof mode."""

from __future__ import annotations

import networkx as nx


def compute_graph_stats(
    g: nx.DiGraph,
    entry_nodes: list[str],
    candidate_paths: int,
) -> dict[str, float | int]:
    if g.number_of_nodes() == 0:
        return {
            "connected_components": 0,
            "average_degree": 0.0,
            "reachable_nodes": 0,
            "candidate_attack_paths": candidate_paths,
        }

    components = nx.number_weakly_connected_components(g)
    avg_degree = sum(d for _, d in g.degree()) / g.number_of_nodes()
    reachable: set[str] = set()
    for entry in entry_nodes:
        if entry not in g:
            continue
        reachable.add(entry)
        reachable.update(nx.descendants(g, entry))

    return {
        "connected_components": components,
        "average_degree": round(avg_degree, 2),
        "reachable_nodes": len(reachable),
        "candidate_attack_paths": candidate_paths,
    }
