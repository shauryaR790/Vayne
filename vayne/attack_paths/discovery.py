"""Graph-based attack path discovery — validated paths only."""

from __future__ import annotations

import uuid
from itertools import islice

import networkx as nx

from vayne.attack_paths.formulas import (
    MIN_PATH_CONFIDENCE,
    attacker_effort_by_hops,
    build_termination_message,
    format_scoring_breakdown,
    missing_evidence_to_continue,
    path_confidence,
    path_meets_confidence_threshold,
)
from vayne.attack_paths.graph_builder import SecurityGraphBuilder
from vayne.attack_paths.graph_stats import compute_graph_stats
from vayne.attack_paths.proof import GraphProof, GraphStatistics, PathDiscoveryProof
from vayne.attack_paths.scoring import score_path
from vayne.models import (
    Asset,
    AttackPath,
    AttackPathEdge,
    AttackPathNode,
    Classification,
    CorrelatedFinding,
    Finding,
    NodeType,
    PathScoringBreakdown,
    ValidationResult,
)

MAX_PATHS = 50
MAX_HOPS = 12
PATH_ENUM_LIMIT = 500


def build_security_graph(
    findings: list[Finding],
    assets: list[Asset],
    correlated: list[CorrelatedFinding],
    validations: dict[str, ValidationResult] | None = None,
) -> nx.DiGraph:
    builder = SecurityGraphBuilder()
    return builder.build(findings, assets, correlated, validations)


def discover_attack_paths(
    findings: list[Finding],
    assets: list[Asset],
    correlated: list[CorrelatedFinding],
    validations: dict[str, ValidationResult] | None = None,
) -> tuple[list[AttackPath], GraphProof]:
    validations = validations or {}
    validated_ids = _validated_finding_ids(correlated, validations)

    builder = SecurityGraphBuilder()
    g = builder.build(findings, assets, correlated, validations)
    proof = builder.proof
    proof.discovered_assets = [a.model_dump() for a in builder.discovered_assets]

    path_proof = PathDiscoveryProof(
        entry_nodes=_entry_nodes(g),
        terminal_nodes=_terminal_nodes(g),
    )
    proof.path_discovery = path_proof
    proof.graph_statistics = GraphStatistics(**compute_graph_stats(g, path_proof.entry_nodes, 0))

    if g.number_of_nodes() < 2 or g.number_of_edges() < 1:
        return [], proof
    if not validated_ids:
        return [], proof

    entries = path_proof.entry_nodes
    terminals = path_proof.terminal_nodes
    if not entries or not terminals:
        return [], proof

    node_data = {n: dict(d) for n, d in g.nodes(data=True)}

    candidates: list[tuple[float, str, list[str], list[int]]] = []
    seen: set[tuple[str, ...]] = set()
    raw_count = 0
    invalid_edges = 0
    low_conf = 0
    no_validated = 0
    rejected = 0
    rejected_reasons: list[str] = []
    sample_paths: list[str] = []

    for entry in entries:
        for terminal in terminals:
            if entry == terminal:
                continue
            if not nx.has_path(g, entry, terminal):
                continue
            for path in islice(
                nx.all_simple_paths(g, entry, terminal, cutoff=MAX_HOPS),
                PATH_ENUM_LIMIT,
            ):
                raw_count += 1
                label_path = " -> ".join(
                    g.nodes[n].get("label", n.split(":")[-1]) for n in path
                )
                if len(sample_paths) < 8:
                    sample_paths.append(label_path)

                if len(path) < 2:
                    rejected += 1
                    rejected_reasons.append(f"{label_path}: path too short")
                    continue
                if not _path_edges_valid(g, path):
                    invalid_edges += 1
                    rejected += 1
                    rejected_reasons.append(f"{label_path}: missing edge evidence or validation")
                    continue
                if not _path_has_validated_finding(g, path, validated_ids):
                    no_validated += 1
                    rejected += 1
                    rejected_reasons.append(f"{label_path}: no validated finding on path")
                    continue

                key = tuple(path)
                if key in seen:
                    continue
                seen.add(key)

                risk, detail, contributions = score_path(g, path)
                if not path_meets_confidence_threshold(contributions):
                    low_conf += 1
                    rejected += 1
                    rejected_reasons.append(
                        f"{label_path}: confidence below threshold ({MIN_PATH_CONFIDENCE}%)"
                    )
                    continue
                candidates.append((risk, detail, path, contributions))

    path_proof.raw_paths_enumerated = raw_count
    path_proof.paths_invalid_edges = invalid_edges
    path_proof.paths_low_confidence = low_conf
    path_proof.paths_no_validated_finding = no_validated
    path_proof.paths_rejected = rejected
    path_proof.rejected_path_reasons = rejected_reasons
    path_proof.paths_accepted = min(len(candidates), MAX_PATHS)
    path_proof.sample_raw_paths = sample_paths
    if proof.graph_statistics:
        proof.graph_statistics.candidate_attack_paths = raw_count

    if not candidates:
        return [], proof

    candidates.sort(key=lambda x: x[0], reverse=True)
    paths = [
        _path_to_model(g, path, risk, detail, contributions, assets, node_data)
        for risk, detail, path, contributions in candidates[:MAX_PATHS]
    ]
    return paths, proof


def _validated_finding_ids(
    correlated: list[CorrelatedFinding],
    validations: dict[str, ValidationResult],
) -> set[str]:
    return {
        cf.id
        for cf in correlated
        if (v := validations.get(cf.id))
        and v.classification
        in (Classification.CONFIRMED, Classification.LIKELY_EXPLOITABLE)
    }


def _path_has_validated_finding(
    g: nx.DiGraph, path: list[str], validated_ids: set[str]
) -> bool:
    for nid in path:
        if not nid.startswith("vuln:"):
            continue
        for fid in g.nodes[nid].get("finding_ids", []):
            if fid in validated_ids:
                return True
    return False


def _path_edges_valid(g: nx.DiGraph, path: list[str]) -> bool:
    for u, v in zip(path[:-1], path[1:]):
        if not g.has_edge(u, v):
            return False
        ed = g.edges[u, v]
        if not ed.get("finding_id") or not str(ed.get("evidence", "")).strip():
            return False
        if not ed.get("validation_checks") or ed.get("confidence_contribution", 0) <= 0:
            return False
        if not ed.get("discovered_from"):
            return False
    return True


def _entry_nodes(g: nx.DiGraph) -> list[str]:
    return [n for n, d in g.nodes(data=True) if d.get("is_entry")]


def _terminal_nodes(g: nx.DiGraph) -> list[str]:
    terminal_types = {
        "database", "identity", "credential", "asset", "endpoint",
    }
    return [
        n
        for n in g.nodes
        if g.out_degree(n) == 0
        and not g.nodes[n].get("is_entry")
        and g.nodes[n].get("node_type") in terminal_types
    ]


def _path_to_model(
    g: nx.DiGraph,
    path: list[str],
    risk_score: float,
    risk_detail: str,
    contributions: list[int],
    assets: list[Asset],
    node_data: dict[str, dict],
) -> AttackPath:
    nodes: list[AttackPathNode] = []
    edges: list[AttackPathEdge] = []

    for nid in path:
        data = g.nodes[nid]
        nodes.append(
            AttackPathNode(
                id=nid,
                label=data.get("label", nid),
                node_type=NodeType(data.get("node_type", "asset")),
                evidence=data.get("evidence", []),
                source_finding_ids=data.get("finding_ids", []),
                risk_level=_node_risk(data),
            )
        )

    for u, v in zip(path[:-1], path[1:]):
        ed = g.edges[u, v]
        contrib = ed.get("confidence_contribution", 0)
        edges.append(
            AttackPathEdge(
                edge_id=ed.get("edge_id", ""),
                source_id=u,
                target_id=v,
                relationship=ed.get("relationship", ""),
                confidence=contrib,
                confidence_contribution=contrib,
                confidence_breakdown=list(ed.get("confidence_breakdown", [])),
                evidence=ed.get("evidence", ""),
                source_finding_id=ed.get("finding_id", ""),
                source_tool=ed.get("source_tool", ""),
                discovered_from=list(ed.get("discovered_from", [])),
                artifact_type=ed.get("artifact_type", ""),
                validation_checks_passed=list(ed.get("validation_checks", [])),
                exploitability=ed.get("exploitability", ""),
                privilege_gained=ed.get("privilege_gained", ""),
            )
        )

    path_conf = path_confidence(contributions)
    hop_count = len(path) - 1
    effort, effort_calc = attacker_effort_by_hops(hop_count)
    missing = missing_evidence_to_continue(path, node_data, assets)
    termination_message = build_termination_message(missing)

    scoring_dict = format_scoring_breakdown(
        edge_contributions=contributions,
        path_conf=path_conf,
        hops=hop_count,
        effort_calc=effort_calc,
        risk=risk_score,
        risk_detail=risk_detail,
    )

    labels = [n.label for n in nodes]
    title = " → ".join(labels)
    if termination_message:
        title = f"{title} → ATTACK PATH TERMINATED"

    return AttackPath(
        id=uuid.uuid4().hex[:8],
        title=title,
        nodes=nodes,
        edges=edges,
        risk_score=risk_score,
        exploitability=round(min(10.0, risk_score * 0.85), 1),
        complexity=effort,
        attacker_effort=effort,
        confidence=path_conf,
        hop_count=hop_count,
        termination_message=termination_message,
        missing_evidence=missing,
        scoring=PathScoringBreakdown(**scoring_dict),
    )


def _node_risk(data: dict) -> str:
    nt = data.get("node_type", "")
    if nt in ("vulnerability", "identity", "credential", "database"):
        return "high"
    if nt == "software":
        return "medium"
    return "medium"
