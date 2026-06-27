"""Sound early pruning for beam search.

CRITICAL INVARIANT: every rule here is a strict *subset* of what
`validate_full_path` already rejects. A branch is pruned only when **no**
extension of it could ever pass validation. This guarantees the search never
discards a path that today's `all_simple_paths` + validation would have
accepted — i.e. it preserves Metasploitable/scan_results parity while cutting
the combinatorial search space early.

Terminal-type checks, the "validated finding required" rule, the confidence
threshold, and final terminal validation deliberately remain in
`validate_full_path` (NOT moved here), so the final accept/reject decision is
byte-identical to before.
"""

from __future__ import annotations

import networkx as nx

from vayne.attack_paths.capabilities import (
    chain_is_logical,
    transitions_are_valid,
)
from vayne.attack_paths.search.search_state import (
    SearchContext,
    SearchState,
    node_capability,
)


def should_prune(
    state: SearchState,
    neighbor: str,
    ctx: SearchContext,
    max_depth: int,
) -> tuple[bool, str]:
    """Return (prune?, reason). Reason is "" when not pruned."""
    g = ctx.g

    # 1. Loop: all_simple_paths is simple-only; revisiting a node never appears
    #    in current output, so this is always safe.
    if neighbor in state.visited:
        return True, "loop"

    # 2. Depth: identical horizon to the current cutoff=MAX_HOPS.
    if state.depth + 1 > max_depth:
        return True, "max_depth"

    nd = g.nodes[neighbor]

    # 3. Dead-end: neighbor is not a target and cannot reach any target. Such a
    #    branch can never end at a target node, so validation always rejects it.
    if neighbor not in ctx.targets and neighbor not in ctx.can_reach_target:
        return True, "dead_end_no_target"

    # 4. Impossible capability transition (Step B matrix) / capability
    #    regression. Capabilities are prefix-monotonic, so an invalid prefix can
    #    never become valid by extension — pruning here matches the rejection
    #    `validate_full_path` would issue for the completed path.
    cap = node_capability(neighbor, nd)
    if cap is not None:
        caps = state.capabilities
        if not caps or cap != caps[-1]:
            tentative = [*caps, cap]
            ok_trans, _ = transitions_are_valid(tentative)
            if not ok_trans:
                return True, "impossible_transition"
            ok_logic, _ = chain_is_logical(tentative)
            if not ok_logic:
                return True, "capability_regression"

    return False, ""


def neighbor_can_reach_target(g: nx.DiGraph, ctx: SearchContext, node: str) -> bool:
    """Helper for tests/diagnostics."""
    return node in ctx.targets or node in ctx.can_reach_target
