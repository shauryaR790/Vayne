"""A*-style heuristic value for beam search (deterministic, evidence-based).

`heuristic_score` estimates the value of continuing to expand a state. It is a
pure function of graph attributes that already exist (edge confidence, node
criticality, applicability status, accumulated privilege) — no ML, no random,
no probabilistic generation. Higher score = more promising = explored first.

    score = g_value * (1 + h_value) * tier_weight

    g_value (evidence accumulated so far)
        = (mean edge confidence / 100)
        * privilege_progress(privilege_level, credential_count)

    h_value (optimistic forward estimate to a target)
        = (max reachable target criticality / 10)
        * (0.5 + 0.5 * terminal_proximity)

    tier_weight
        boosts paths carrying VERIFIED exploit/credential/escalation evidence,
        penalizes candidate / partial / inventory-only paths.
"""

from __future__ import annotations

from vayne.attack_paths.search.search_state import SearchContext, SearchState

# Discrete capability-priority weights (verified exploit > credential > priv-esc
# > lateral > data; candidate/partial/inventory penalized). Applied as a
# multiplier so the ordering is exact and auditable.
_VERIFIED_BOOST = 1.6
_CANDIDATE_PENALTY = 0.55
_PARTIAL_PENALTY = 0.7
_INVENTORY_PENALTY = 0.85


def _mean_edge_confidence(state: SearchState, ctx: SearchContext) -> float:
    path = state.path
    if len(path) < 2:
        return 100.0
    g = ctx.g
    total = 0
    for u, v in zip(path[:-1], path[1:]):
        total += g.edges[u, v].get("confidence_contribution", 0)
    return total / (len(path) - 1)


def _tier_weight(state: SearchState, ctx: SearchContext) -> float:
    g = ctx.g
    weight = 1.0
    saw_verified = False
    saw_candidate = False
    saw_partial = False
    has_substance = False
    for nid in state.path:
        nd = g.nodes[nid]
        status = nd.get("applicability_status", "")
        if status == "verified":
            saw_verified = True
        elif status == "candidate":
            saw_candidate = True
        elif status == "partial":
            saw_partial = True
        nt = nd.get("node_type", "")
        if nt not in ("endpoint", "asset", "service", "software"):
            has_substance = True
    if saw_verified:
        weight *= _VERIFIED_BOOST
    if saw_candidate and not saw_verified:
        weight *= _CANDIDATE_PENALTY
    if saw_partial and not saw_verified:
        weight *= _PARTIAL_PENALTY
    if not has_substance:
        weight *= _INVENTORY_PENALTY
    return weight


def heuristic_score(state: SearchState, ctx: SearchContext) -> float:
    """Deterministic A* priority value (higher explored first)."""
    g_value = (_mean_edge_confidence(state, ctx) / 100.0) * (
        1.0 + 0.15 * state.privilege_level + 0.05 * min(state.credential_count, 4)
    )

    node = state.current_node
    crit = ctx.max_reach_crit.get(node, 0.0) / 10.0
    dist = ctx.dist_to_target.get(node)
    proximity = 1.0 / (1.0 + dist) if dist is not None else 0.0
    h_value = crit * (0.5 + 0.5 * proximity)

    return round(g_value * (1.0 + h_value) * _tier_weight(state, ctx), 9)
