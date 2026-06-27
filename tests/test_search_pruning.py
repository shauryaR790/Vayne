"""Early-pruning soundness tests (Phase D)."""

from __future__ import annotations

import networkx as nx

from vayne.attack_paths.search.beam_search import beam_search
from vayne.attack_paths.search.pruning import should_prune
from vayne.attack_paths.search.search_state import SearchState
from vayne.models import AttackCapability as Cap

from tests._search_fixtures import add_edge, add_node, ctx_for


def _state(path, caps):
    return SearchState(
        path=tuple(path),
        current_node=path[-1],
        confidence=80,
        risk=0.0,
        capabilities=tuple(caps),
        privilege_level=0,
        credential_count=0,
        terminal_reached=False,
        depth=len(path) - 1,
        heuristic_score=0.0,
        visited=frozenset(path),
    )


# --------------------------------------------------------------------------- #
# Impossible capability transitions                                            #
# --------------------------------------------------------------------------- #

def test_internet_cve_database_pruned():
    """internet -> CVE -> database has no credential/priv-esc step:
    EXECUTION -> DATA_ACCESS is an impossible transition."""
    g = nx.DiGraph()
    add_node(g, "entry:internet", "endpoint", is_entry=True)
    add_node(g, "vuln:a", "vulnerability")
    add_node(g, "db:a", "database")
    add_edge(g, "entry:internet", "vuln:a")
    add_edge(g, "vuln:a", "db:a")
    ctx = ctx_for(g, {"db:a"})

    state = _state(["entry:internet", "vuln:a"], [Cap.INITIAL_ACCESS, Cap.CODE_EXECUTION])
    prune, reason = should_prune(state, "db:a", ctx, max_depth=12)
    assert prune and reason == "impossible_transition"

    assert beam_search(ctx, ["entry:internet"]) == []


def test_internet_domain_admin_pruned():
    """INITIAL_ACCESS -> DOMAIN_COMPROMISE is impossible."""
    g = nx.DiGraph()
    add_node(g, "entry:internet", "endpoint", is_entry=True)
    add_node(g, "dom:a", "domain")
    add_edge(g, "entry:internet", "dom:a")
    ctx = ctx_for(g, {"dom:a"})

    state = _state(["entry:internet"], [Cap.INITIAL_ACCESS])
    prune, reason = should_prune(state, "dom:a", ctx, max_depth=12)
    assert prune and reason == "impossible_transition"
    assert beam_search(ctx, ["entry:internet"]) == []


def test_service_to_database_pruned():
    """internet -> host -> service -> database (no creds) is impossible."""
    g = nx.DiGraph()
    add_node(g, "entry:internet", "endpoint", is_entry=True)
    add_node(g, "asset:h", "asset")
    add_node(g, "svc:a", "service")
    add_node(g, "db:a", "database")
    add_edge(g, "entry:internet", "asset:h")
    add_edge(g, "asset:h", "svc:a")
    add_edge(g, "svc:a", "db:a")
    ctx = ctx_for(g, {"db:a"})
    # service/asset are structural (no capability), so caps stay [INITIAL_ACCESS].
    state = _state(
        ["entry:internet", "asset:h", "svc:a"], [Cap.INITIAL_ACCESS]
    )
    prune, reason = should_prune(state, "db:a", ctx, max_depth=12)
    assert prune and reason == "impossible_transition"
    assert beam_search(ctx, ["entry:internet"]) == []


# --------------------------------------------------------------------------- #
# Loops                                                                        #
# --------------------------------------------------------------------------- #

def test_loop_pruned():
    g = nx.DiGraph()
    add_node(g, "a", "endpoint", is_entry=True)
    add_node(g, "b", "vulnerability")
    add_edge(g, "a", "b")
    add_edge(g, "b", "a")
    ctx = ctx_for(g, {"b"})
    state = _state(["a", "b"], [Cap.INITIAL_ACCESS, Cap.CODE_EXECUTION])
    prune, reason = should_prune(state, "a", ctx, max_depth=12)
    assert prune and reason == "loop"


def test_loop_graph_yields_finite_paths():
    """A→B→A→B cycles must not produce infinite/looping paths."""
    g = nx.DiGraph()
    add_node(g, "entry:a", "endpoint", is_entry=True)
    add_node(g, "vuln:b", "vulnerability", applicability_status="verified")
    add_edge(g, "entry:a", "vuln:b")
    add_edge(g, "vuln:b", "entry:a")
    ctx = ctx_for(g, {"vuln:b"})
    results = beam_search(ctx, ["entry:a"])
    assert results == [["entry:a", "vuln:b"]]


# --------------------------------------------------------------------------- #
# Dead-ends / depth                                                            #
# --------------------------------------------------------------------------- #

def test_dead_end_pruned():
    g = nx.DiGraph()
    add_node(g, "entry:internet", "endpoint", is_entry=True)
    add_node(g, "vuln:a", "vulnerability", applicability_status="verified")
    add_node(g, "noise:x", "service")  # leads nowhere, not a target
    add_node(g, "db:a", "database")
    add_edge(g, "entry:internet", "vuln:a")
    add_edge(g, "vuln:a", "noise:x")
    add_edge(g, "entry:internet", "db:a")  # impossible (pruned), but db reachable
    ctx = ctx_for(g, {"db:a"})
    state = _state(
        ["entry:internet", "vuln:a"], [Cap.INITIAL_ACCESS, Cap.CODE_EXECUTION]
    )
    prune, reason = should_prune(state, "noise:x", ctx, max_depth=12)
    assert prune and reason == "dead_end_no_target"


def test_max_depth_pruned():
    g = nx.DiGraph()
    add_node(g, "entry:internet", "endpoint", is_entry=True)
    add_node(g, "vuln:a", "vulnerability")
    add_node(g, "db:a", "database")
    add_edge(g, "entry:internet", "vuln:a")
    add_edge(g, "vuln:a", "db:a")
    ctx = ctx_for(g, {"db:a"})
    state = _state(["entry:internet", "vuln:a"], [Cap.INITIAL_ACCESS, Cap.CODE_EXECUTION])
    prune, reason = should_prune(state, "db:a", ctx, max_depth=1)
    assert prune and reason == "max_depth"
