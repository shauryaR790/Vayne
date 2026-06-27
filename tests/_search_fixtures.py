"""Shared synthetic-graph builders for Phase D search-engine tests."""

from __future__ import annotations

import networkx as nx

from vayne.attack_paths.search.search_state import SearchContext


def add_node(g: nx.DiGraph, nid: str, node_type: str, **attrs) -> str:
    g.add_node(
        nid,
        node_type=node_type,
        label=attrs.pop("label", nid),
        is_entry=attrs.pop("is_entry", False),
        capability=attrs.pop("capability", ""),
        applicability_status=attrs.pop("applicability_status", ""),
        confidence=attrs.pop("confidence", 0),
        blast_radius=attrs.pop("blast_radius", 0),
        **attrs,
    )
    return nid


def add_edge(g: nx.DiGraph, u: str, v: str, conf: int = 80, **attrs) -> None:
    g.add_edge(u, v, confidence_contribution=conf, **attrs)


def ctx_for(g: nx.DiGraph, targets) -> SearchContext:
    return SearchContext.build(g, set(targets), validated_ids=set())


def linear_graph(node_types: list[tuple[str, str]]) -> nx.DiGraph:
    """Build a simple chain. `node_types` = [(node_id, node_type), ...].
    The first node is the entry."""
    g = nx.DiGraph()
    prev = None
    for i, (nid, nt) in enumerate(node_types):
        add_node(g, nid, nt, is_entry=(i == 0))
        if prev is not None:
            add_edge(g, prev, nid)
        prev = nid
    return g
