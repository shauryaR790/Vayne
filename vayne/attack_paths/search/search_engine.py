"""Public entry point for attack-path discovery.

`find_attack_paths` dispatches between the new deterministic beam search and the
legacy `networkx.all_simple_paths` enumeration (kept as a fallback for A/B
verification). It returns an ordered list of node-id paths; the caller
(`discovery.discover_attack_paths`) still validates and scores each one with the
unchanged pipeline.
"""

from __future__ import annotations

from itertools import islice

import networkx as nx

from vayne.attack_paths.search.beam_search import (
    BEAM_WIDTH,
    MAX_DEPTH,
    MAX_PATHS,
    beam_search,
)
from vayne.attack_paths.search.search_state import SearchContext

# Default search strategy. "beam" = deterministic weighted beam search (Phase D).
# "all_simple_paths" = legacy exhaustive enumeration (fallback / parity checks).
SEARCH_MODE = "beam"

# Legacy enumeration limits (kept identical to discovery's originals).
LEGACY_MAX_HOPS = 12
LEGACY_PATH_ENUM_LIMIT = 500

BEAM_ALGORITHM_LABEL = (
    "deterministic weighted beam search (A* heuristic, replaces "
    "networkx.all_simple_paths)"
)
LEGACY_ALGORITHM_LABEL = "networkx.all_simple_paths"


def find_attack_paths(
    g: nx.DiGraph,
    entries: list[str],
    targets: list[str],
    validated_ids: set[str],
    *,
    mode: str = SEARCH_MODE,
    proof=None,
) -> list[list[str]]:
    """Discover candidate attack paths from `entries` to `targets`.

    Returns a list of node-id paths. Validation/scoring happens in the caller.
    """
    if not entries or not targets:
        if proof is not None:
            proof.algorithm = (
                BEAM_ALGORITHM_LABEL if mode == "beam" else LEGACY_ALGORITHM_LABEL
            )
        return []

    if mode == "all_simple_paths":
        if proof is not None:
            proof.algorithm = LEGACY_ALGORITHM_LABEL
        return _legacy_enumerate(g, entries, targets)

    ctx = SearchContext.build(g, targets, validated_ids)
    paths = beam_search(ctx, entries)
    if proof is not None:
        proof.algorithm = BEAM_ALGORITHM_LABEL
        proof.search_states_expanded = ctx.states_expanded
        proof.search_branches_pruned = ctx.branches_pruned
        proof.search_prune_reasons = dict(ctx.prune_reason_counts)
    return paths


def _legacy_enumerate(
    g: nx.DiGraph,
    entries: list[str],
    targets: list[str],
) -> list[list[str]]:
    """Reproduce the exact ordering/semantics of the original triple loop."""
    out: list[list[str]] = []
    for entry in entries:
        for terminal in targets:
            if entry == terminal:
                continue
            if not nx.has_path(g, entry, terminal):
                continue
            for path in islice(
                nx.all_simple_paths(g, entry, terminal, cutoff=LEGACY_MAX_HOPS),
                LEGACY_PATH_ENUM_LIMIT,
            ):
                out.append(path)
    return out


__all__ = [
    "find_attack_paths",
    "SEARCH_MODE",
    "BEAM_WIDTH",
    "MAX_DEPTH",
    "MAX_PATHS",
]
