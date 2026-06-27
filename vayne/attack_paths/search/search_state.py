"""Immutable search state + precomputed search context for beam search.

`SearchState` is a frozen dataclass (hashable, no aliasing) so the search is
fully deterministic. `SearchContext` precomputes — once per search — the
read-only graph facts the heuristic and pruning layers need (criticality,
reachability to targets, distance to nearest target). Nothing here mutates the
graph or performs validation.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

import networkx as nx

from vayne.attack_paths.asset_criticality import classify_criticality
from vayne.attack_paths.capabilities import capability_for_node
from vayne.models import AttackCapability

# Node types that, on their own, never contribute a capability transition — they
# are pure inventory/structure. Mirrors the skip rules in `validate_full_path`.
_STRUCTURAL_NODE_TYPES = frozenset({"asset", "service", "software"})

# Node types that represent attacker-held credentials (for credential_count).
_CREDENTIAL_NODE_TYPES = frozenset(
    {"credential", "secret", "api_key", "jwt", "ssh_key", "session"}
)


@dataclass(frozen=True)
class SearchState:
    """One immutable node in the beam-search frontier."""

    path: tuple[str, ...]
    current_node: str
    confidence: int
    risk: float
    capabilities: tuple[AttackCapability, ...]
    privilege_level: int
    credential_count: int
    terminal_reached: bool
    depth: int
    heuristic_score: float
    visited: frozenset[str]


def node_capability(node_id: str, node_data: dict) -> AttackCapability | None:
    """Capability contributed by a node, using the SAME skip rules as
    `validate_full_path` so search-time reasoning matches validation exactly."""
    nt = node_data.get("node_type", "")
    override = node_data.get("capability", "")
    if nt == "endpoint" and not override:
        return None
    if nt in _STRUCTURAL_NODE_TYPES and not override:
        return None
    return capability_for_node(nt, override)


def privilege_level(capabilities: tuple[AttackCapability, ...]) -> int:
    """0 none · 1 credentials · 2 privilege-escalation · 3 admin/domain."""
    caps = set(capabilities)
    if AttackCapability.DOMAIN_COMPROMISE in caps:
        return 3
    if AttackCapability.PRIVILEGE_ESCALATION in caps:
        return 2
    if AttackCapability.CREDENTIAL_ACCESS in caps:
        return 1
    return 0


def is_credential_node(node_data: dict) -> bool:
    return node_data.get("node_type", "") in _CREDENTIAL_NODE_TYPES


@dataclass
class SearchContext:
    """Precomputed, read-only graph facts shared across a single search run."""

    g: nx.DiGraph
    targets: frozenset[str]
    validated_ids: set[str]
    dist_to_target: dict[str, int]
    can_reach_target: frozenset[str]
    max_reach_crit: dict[str, float]
    node_crit: dict[str, float]
    # Mutable proof/telemetry counters (not used for any ordering decision).
    states_expanded: int = 0
    branches_pruned: int = 0
    prune_reason_counts: dict[str, int] = field(default_factory=dict)

    def record_prune(self, reason: str) -> None:
        self.branches_pruned += 1
        self.prune_reason_counts[reason] = self.prune_reason_counts.get(reason, 0) + 1

    def criticality(self, node_id: str) -> float:
        return self.node_crit.get(node_id, 0.0)

    @classmethod
    def build(
        cls,
        g: nx.DiGraph,
        targets: list[str] | set[str],
        validated_ids: set[str],
    ) -> "SearchContext":
        target_set = frozenset(targets)

        node_crit: dict[str, float] = {}
        for n, d in g.nodes(data=True):
            try:
                _, weight = classify_criticality(n, d)
            except Exception:
                weight = 0.0
            node_crit[n] = float(weight)

        # Distance to nearest target via multi-source BFS on the reversed graph.
        dist: dict[str, int] = {}
        dq: deque[str] = deque()
        for t in target_set:
            if t in g:
                dist[t] = 0
                dq.append(t)
        while dq:
            cur = dq.popleft()
            for pred in g.predecessors(cur):
                if pred not in dist:
                    dist[pred] = dist[cur] + 1
                    dq.append(pred)
        can_reach = frozenset(dist)

        # Max criticality of any target reachable from a node (forward estimate).
        max_crit: dict[str, float] = {}
        for t in target_set:
            if t not in g:
                continue
            ct = node_crit.get(t, 0.0)
            reachers = nx.ancestors(g, t)
            reachers.add(t)
            for a in reachers:
                if max_crit.get(a, 0.0) < ct:
                    max_crit[a] = ct

        return cls(
            g=g,
            targets=target_set,
            validated_ids=set(validated_ids),
            dist_to_target=dist,
            can_reach_target=can_reach,
            max_reach_crit=max_crit,
            node_crit=node_crit,
        )
