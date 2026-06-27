"""Scalability test (Phase D): 500 nodes / ~5000 edges must finish < 5s."""

from __future__ import annotations

import time

import networkx as nx

from vayne.attack_paths.search.beam_search import MAX_PATHS, beam_search
from tests._search_fixtures import ctx_for

LAYERS = 10
PER_LAYER = 50
FANOUT = 11


def _build_large_dag() -> tuple[nx.DiGraph, list[str]]:
    """Deterministic layered DAG: 500 nodes, ~5000 forward edges."""
    g = nx.DiGraph()
    g.add_node(
        "n0",
        node_type="endpoint",
        label="n0",
        is_entry=True,
        capability="",
        applicability_status="",
        blast_radius=0,
    )
    for i in range(1, LAYERS * PER_LAYER):
        g.add_node(
            f"n{i}",
            node_type="vulnerability",
            label=f"n{i}",
            is_entry=False,
            capability="",
            applicability_status="verified" if i % 3 == 0 else "candidate",
            blast_radius=i % 20,
        )

    total = LAYERS * PER_LAYER
    for i in range(total):
        layer = i // PER_LAYER
        if layer + 1 >= LAYERS:
            continue
        base = (layer + 1) * PER_LAYER
        for k in range(FANOUT):
            j = base + ((i * 7 + k * 13) % PER_LAYER)
            if j < total and j != i:
                g.add_edge(f"n{i}", f"n{j}", confidence_contribution=50 + (j % 40))

    targets = [f"n{(LAYERS - 1) * PER_LAYER + t * 9}" for t in range(5)]
    return g, targets


def test_large_graph_under_5_seconds():
    g, targets = _build_large_dag()
    assert g.number_of_nodes() == 500
    assert g.number_of_edges() >= 4500

    ctx = ctx_for(g, targets)
    start = time.perf_counter()
    results = beam_search(ctx, ["n0"])
    elapsed = time.perf_counter() - start

    assert elapsed < 5.0, f"beam search took {elapsed:.2f}s (>5s)"
    assert len(results) <= MAX_PATHS
    # every emitted path ends at a target
    assert all(r[-1] in set(targets) for r in results)


def test_large_graph_deterministic():
    g, targets = _build_large_dag()
    ctx1 = ctx_for(g, targets)
    ctx2 = ctx_for(g, targets)
    r1 = beam_search(ctx1, ["n0"])
    r2 = beam_search(ctx2, ["n0"])
    assert r1 == r2
