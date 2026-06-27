"""Deterministic heuristic attack-path search engine (Phase D).

This package replaces ``networkx.all_simple_paths`` for path *discovery* with a
deterministic weighted beam search guided by an A*-style heuristic and sound
early pruning. It changes ONLY how candidate paths are found — every path it
emits is still validated and scored by the existing, unchanged pipeline
(`validate_full_path`, `compute_path_confidence`, `score_path`).

No LLMs, no ML, no randomization, no probabilistic generation.
"""

from __future__ import annotations

from vayne.attack_paths.search.beam_search import (
    BEAM_WIDTH,
    MAX_DEPTH,
    MAX_PATHS,
    beam_search,
)
from vayne.attack_paths.search.search_engine import find_attack_paths
from vayne.attack_paths.search.search_state import SearchContext, SearchState

__all__ = [
    "SearchState",
    "SearchContext",
    "beam_search",
    "find_attack_paths",
    "BEAM_WIDTH",
    "MAX_DEPTH",
    "MAX_PATHS",
]
