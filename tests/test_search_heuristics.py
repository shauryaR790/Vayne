"""Heuristic prioritization + deterministic tie-break tests (Phase D)."""

from __future__ import annotations

import networkx as nx

from vayne.attack_paths.search.beam_search import _extend_state, _initial_state
from vayne.attack_paths.search.heuristics import heuristic_score
from vayne.attack_paths.search.priority import priority_key
from vayne.attack_paths.search.search_state import SearchState
from vayne.models import AttackCapability as Cap

from tests._search_fixtures import add_edge, add_node, ctx_for


def _good_vs_bad_graph() -> nx.DiGraph:
    g = nx.DiGraph()
    add_node(g, "entry:internet", "endpoint", is_entry=True)
    # GOOD branch: verified exploit -> credential -> role -> RDS (high value)
    add_node(g, "vuln:a", "vulnerability", applicability_status="verified")
    add_node(g, "cred:a", "credential")
    add_node(g, "id:a", "identity")
    add_node(g, "rds:a", "rds", blast_radius=50)
    add_edge(g, "entry:internet", "vuln:a", conf=95)
    add_edge(g, "vuln:a", "cred:a", conf=90)
    add_edge(g, "cred:a", "id:a", conf=88)
    add_edge(g, "id:a", "rds:a", conf=85)
    # BAD branch: inventory only (service -> service -> software), no target
    add_node(g, "svc:a", "service")
    add_node(g, "svc:b", "service")
    add_node(g, "sw:a", "software")
    add_edge(g, "entry:internet", "svc:a", conf=70)
    add_edge(g, "svc:a", "svc:b", conf=60)
    add_edge(g, "svc:b", "sw:a", conf=55)
    return g


def test_exploit_branch_outranks_inventory_branch():
    g = _good_vs_bad_graph()
    ctx = ctx_for(g, {"rds:a"})
    root = _initial_state("entry:internet", ctx)
    good = _extend_state(root, "vuln:a", ctx)
    bad = _extend_state(root, "svc:a", ctx)
    assert good.heuristic_score > bad.heuristic_score


def test_verified_outranks_candidate():
    g = nx.DiGraph()
    add_node(g, "entry:internet", "endpoint", is_entry=True)
    add_node(g, "vuln:v", "vulnerability", applicability_status="verified")
    add_node(g, "vuln:c", "vulnerability", applicability_status="candidate")
    add_node(g, "db:a", "database")
    add_edge(g, "entry:internet", "vuln:v", conf=90)
    add_edge(g, "entry:internet", "vuln:c", conf=90)
    add_edge(g, "vuln:v", "db:a", conf=90)
    add_edge(g, "vuln:c", "db:a", conf=90)
    ctx = ctx_for(g, {"db:a"})
    root = _initial_state("entry:internet", ctx)
    verified = _extend_state(root, "vuln:v", ctx)
    candidate = _extend_state(root, "vuln:c", ctx)
    assert verified.heuristic_score > candidate.heuristic_score


def test_full_good_path_scores_higher_than_inventory_chain():
    g = _good_vs_bad_graph()
    ctx = ctx_for(g, {"rds:a"})
    # Walk the good chain fully.
    s = _initial_state("entry:internet", ctx)
    for nid in ("vuln:a", "cred:a", "id:a", "rds:a"):
        s = _extend_state(s, nid, ctx)
    good_score = s.heuristic_score
    # Walk the inventory chain fully.
    b = _initial_state("entry:internet", ctx)
    for nid in ("svc:a", "svc:b", "sw:a"):
        b = _extend_state(b, nid, ctx)
    assert good_score > b.heuristic_score


# --------------------------------------------------------------------------- #
# Deterministic tie-break ordering                                             #
# --------------------------------------------------------------------------- #

def _state(node, conf, risk, h):
    return SearchState(
        path=(node,),
        current_node=node,
        confidence=conf,
        risk=risk,
        capabilities=(Cap.INITIAL_ACCESS,),
        privilege_level=0,
        credential_count=0,
        terminal_reached=False,
        depth=0,
        heuristic_score=h,
        visited=frozenset((node,)),
    )


def test_tiebreak_confidence_then_risk_then_nodeid():
    g = nx.DiGraph()
    for n in ("n1", "n2", "n3", "n4"):
        add_node(g, n, "vulnerability")
    ctx = ctx_for(g, set())

    # Equal heuristic → higher confidence sorts first (smaller key).
    a = _state("n1", conf=90, risk=5.0, h=1.0)
    b = _state("n2", conf=80, risk=9.0, h=1.0)
    assert priority_key(a, ctx) < priority_key(b, ctx)

    # Equal heuristic + confidence → higher risk first.
    c = _state("n3", conf=90, risk=9.0, h=1.0)
    d = _state("n4", conf=90, risk=5.0, h=1.0)
    assert priority_key(c, ctx) < priority_key(d, ctx)

    # Fully tied except node_id → ASC node_id first.
    e = _state("aaa", conf=90, risk=5.0, h=1.0)
    f = _state("bbb", conf=90, risk=5.0, h=1.0)
    add_node(g, "aaa", "vulnerability")
    add_node(g, "bbb", "vulnerability")
    ctx2 = ctx_for(g, set())
    assert priority_key(e, ctx2) < priority_key(f, ctx2)
