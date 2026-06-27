"""Deterministic weighted beam search with A* heuristic guidance.

Replaces `networkx.all_simple_paths` for path *discovery*. Produces an ordered
list of candidate node-id paths; each is still handed to the unchanged
`validate_full_path` / `compute_path_confidence` / `score_path` pipeline.

Determinism: neighbors and entries are iterated in sorted (node_id) order, the
frontier is a total-order min-heap, and the heuristic is a pure function — so
output is identical on every run.

Parity: pruning is sound (a subset of existing rejections) and, on small graphs,
the live frontier never reaches BEAM_WIDTH, so the search is exhaustive and
discovers exactly the same target-reaching paths as `all_simple_paths`.
"""

from __future__ import annotations

from dataclasses import replace

from vayne.attack_paths.search.heuristics import heuristic_score
from vayne.attack_paths.search.priority import DeterministicFrontier
from vayne.attack_paths.search.pruning import should_prune
from vayne.attack_paths.search.search_state import (
    SearchContext,
    SearchState,
    is_credential_node,
    node_capability,
    privilege_level,
)
from vayne.models import AttackCapability

BEAM_WIDTH = 100
MAX_DEPTH = 12  # == discovery.MAX_HOPS — preserves fixture path horizon (parity)
MAX_PATHS = 100
MAX_EXPANSIONS = 200_000  # hard safety bound for very large graphs


def _initial_state(entry: str, ctx: SearchContext) -> SearchState:
    # Capability chain always begins at INITIAL_ACCESS, exactly like
    # `validate_full_path`, regardless of the entry node's own attributes.
    caps: tuple[AttackCapability, ...] = (AttackCapability.INITIAL_ACCESS,)
    state = SearchState(
        path=(entry,),
        current_node=entry,
        confidence=100,
        risk=ctx.max_reach_crit.get(entry, 0.0),
        capabilities=caps,
        privilege_level=privilege_level(caps),
        credential_count=0,
        terminal_reached=entry in ctx.targets,
        depth=0,
        heuristic_score=0.0,
        visited=frozenset((entry,)),
    )
    return replace(state, heuristic_score=heuristic_score(state, ctx))


def _extend_state(state: SearchState, neighbor: str, ctx: SearchContext) -> SearchState:
    g = ctx.g
    nd = g.nodes[neighbor]
    new_path = (*state.path, neighbor)

    caps = state.capabilities
    cap = node_capability(neighbor, nd)
    if cap is not None and (not caps or cap != caps[-1]):
        caps = (*caps, cap)

    confs = [
        g.edges[u, v].get("confidence_contribution", 0)
        for u, v in zip(new_path[:-1], new_path[1:])
    ]
    confidence = int(round(sum(confs) / len(confs))) if confs else 100

    cred_count = state.credential_count + (1 if is_credential_node(nd) else 0)

    candidate = SearchState(
        path=new_path,
        current_node=neighbor,
        confidence=confidence,
        risk=ctx.max_reach_crit.get(neighbor, 0.0),
        capabilities=caps,
        privilege_level=privilege_level(caps),
        credential_count=cred_count,
        terminal_reached=neighbor in ctx.targets,
        depth=len(new_path) - 1,
        heuristic_score=0.0,
        visited=state.visited | {neighbor},
    )
    return replace(candidate, heuristic_score=heuristic_score(candidate, ctx))


def beam_search(
    ctx: SearchContext,
    entries: list[str],
    *,
    beam_width: int = BEAM_WIDTH,
    max_depth: int = MAX_DEPTH,
    max_paths: int = MAX_PATHS,
    max_expansions: int = MAX_EXPANSIONS,
) -> list[list[str]]:
    """Return candidate paths (each a list of node ids) that reach a target."""
    g = ctx.g
    frontier = DeterministicFrontier(ctx)

    for entry in sorted(entries):
        if entry in g:
            frontier.push(_initial_state(entry, ctx))

    results: list[list[str]] = []
    expansions = 0

    while frontier and len(results) < max_paths and expansions < max_expansions:
        state = frontier.pop()
        expansions += 1

        # Save whenever we reach a target node (mirrors today's per-target loop).
        if state.depth >= 1 and state.current_node in ctx.targets:
            results.append(list(state.path))

        if state.depth >= max_depth:
            continue

        for neighbor in sorted(g.successors(state.current_node)):
            prune, reason = should_prune(state, neighbor, ctx, max_depth)
            if prune:
                ctx.record_prune(reason)
                continue
            frontier.push(_extend_state(state, neighbor, ctx))

        frontier.truncate(beam_width)

    ctx.states_expanded = expansions
    return results
