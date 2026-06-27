"""Deterministic priority frontier for beam search.

The frontier is a binary min-heap keyed by a *total order* tuple. Because the
key always ends with the full path tuple, no two live states can ever produce an
equal key, so `heapq` (which is not stable) can never reorder ties — ordering is
100% deterministic and reproducible across runs.
"""

from __future__ import annotations

import heapq

from vayne.attack_paths.search.search_state import SearchContext, SearchState


def priority_key(state: SearchState, ctx: SearchContext) -> tuple:
    """Lower tuple sorts first → explored first.

    Ordering (per Phase D spec): heuristic DESC, then on ties confidence DESC,
    risk DESC, criticality DESC, node_id ASC, and finally the path tuple to
    guarantee a strict total order (no randomness possible).
    """
    crit = ctx.criticality(state.current_node)
    return (
        -round(state.heuristic_score, 9),
        -state.confidence,
        -round(state.risk, 6),
        -round(crit, 6),
        state.current_node,
        state.path,
    )


class DeterministicFrontier:
    """Min-heap wrapper that pops the highest-priority `SearchState`."""

    def __init__(self, ctx: SearchContext) -> None:
        self._ctx = ctx
        self._heap: list[tuple[tuple, SearchState]] = []

    def push(self, state: SearchState) -> None:
        heapq.heappush(self._heap, (priority_key(state, self._ctx), state))

    def pop(self) -> SearchState:
        return heapq.heappop(self._heap)[1]

    def truncate(self, width: int) -> None:
        """Keep only the best `width` live states (beam pruning). Only takes
        effect when the live frontier exceeds the beam width — on small graphs
        it is a no-op, which preserves exhaustive (parity-safe) behavior."""
        if width > 0 and len(self._heap) > width:
            self._heap = heapq.nsmallest(width, self._heap)
            heapq.heapify(self._heap)

    def __len__(self) -> int:
        return len(self._heap)

    def __bool__(self) -> bool:
        return bool(self._heap)
