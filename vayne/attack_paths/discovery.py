"""Graph-based attack path discovery — evidence-first reasoning engine."""

from __future__ import annotations

import uuid

import networkx as nx

from vayne.attack_paths.formulas import (
    MIN_PATH_CONFIDENCE,
    build_termination_message,
    format_scoring_breakdown,
    missing_evidence_to_continue,
)
from vayne.attack_paths.graph_builder import SecurityGraphBuilder
from vayne.attack_paths.graph_stats import compute_graph_stats
from vayne.attack_paths.path_reasoning import (
    build_path_analyst_explanation,
    compute_attacker_effort,
    compute_path_confidence,
    compute_path_confidence_with_proof,
    validate_full_path,
)
from vayne.attack_paths.proof import (
    GraphProof,
    GraphStatistics,
    PathDiscoveryProof,
    build_accepted_proof,
    build_rejected_proof,
    suggest_revival,
)
from vayne.attack_paths.proof.alternatives import AlternativePath
from vayne.attack_paths.search.search_engine import SEARCH_MODE, find_attack_paths
from vayne.attack_paths.asset_criticality import classify_criticality
from vayne.attack_paths.blast_radius import path_blast_radius
from vayne.attack_paths.classification import classify_attack_path
from vayne.attack_paths.scoring import score_path
from vayne.attack_paths.terminals import is_terminal_target
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

    entries = path_proof.entry_nodes
    terminals = path_proof.terminal_nodes

    node_data = {n: dict(d) for n, d in g.nodes(data=True)}

    candidates: list[tuple] = []
    rejected_records: list[dict] = []
    seen: set[tuple[str, ...]] = set()
    raw_count = 0
    rejected = 0
    hypothetical_count = 0
    rejected_reasons: list[str] = []
    accepted_explanations: list[str] = []
    sample_paths: list[str] = []
    confidence_buckets: dict[str, int] = {"0-49": 0, "50-69": 0, "70-89": 0, "90+": 0}

    if not entries:
        return [], proof

    if terminals:
        target_nodes = terminals
    else:
        target_nodes = [
            n
            for n in g.nodes
            if g.out_degree(n) == 0 and not g.nodes[n].get("is_entry")
        ]
    if not target_nodes:
        return [], proof

    raw_paths = find_attack_paths(
        g,
        entries,
        target_nodes,
        validated_ids,
        mode=SEARCH_MODE,
        proof=path_proof,
    )
    for path in raw_paths:
        raw_count += 1
        label_path = " → ".join(
            g.nodes[n].get("label", n.split(":")[-1]) for n in path
        )
        if len(sample_paths) < 8:
            sample_paths.append(label_path)

        accepted, hypothetical, reject_reasons, survive_reasons = validate_full_path(
            g, path, validated_ids
        )

        if not accepted:
            rejected += 1
            reason_str = "; ".join(reject_reasons[:4])
            rejected_reasons.append(
                f"Rejected path: {label_path}\nReason: {reason_str}"
            )
            rejected_records.append(
                _make_rejected_record(
                    g, path, label_path, reason_str, reject_reasons,
                    node_data, assets, validated_ids,
                )
            )
            continue

        multi_tool = _path_multi_tool(g, path)
        path_conf, conf_breakdown = compute_path_confidence(
            g,
            path,
            multi_tool=multi_tool,
            validated=_path_has_validated_finding(g, path, validated_ids),
        )
        _bucket_confidence(confidence_buckets, path_conf)

        if path_conf < MIN_PATH_CONFIDENCE:
            rejected += 1
            low_reason = (
                f"confidence {path_conf}% below threshold {MIN_PATH_CONFIDENCE}%"
            )
            rejected_reasons.append(
                f"Rejected path: {label_path}\nReason: {low_reason}"
            )
            rejected_records.append(
                _make_rejected_record(
                    g, path, label_path, low_reason, [low_reason],
                    node_data, assets, validated_ids,
                    confidence_if_revived=path_conf,
                )
            )
            continue

        key = tuple(path)
        if key in seen:
            continue
        seen.add(key)

        if hypothetical:
            hypothetical_count += 1

        risk, detail, contributions, risk_proof = score_path(g, path)
        survive_line = (
            f"Why this path survives: {label_path}\n"
            + "\n".join(f"+ {r}" for r in survive_reasons)
        )
        accepted_explanations.append(survive_line)
        candidates.append(
            (risk, detail, path, contributions, hypothetical, survive_reasons,
             conf_breakdown, path_conf, risk_proof)
        )

    path_proof.raw_paths_enumerated = raw_count
    path_proof.paths_rejected = rejected
    path_proof.paths_accepted = min(len(candidates), MAX_PATHS)
    path_proof.paths_hypothetical = hypothetical_count
    path_proof.rejected_path_reasons = rejected_reasons
    path_proof.accepted_path_explanations = accepted_explanations
    path_proof.sample_raw_paths = sample_paths
    path_proof.confidence_distribution = confidence_buckets
    path_proof.false_positives_eliminated = rejected
    path_proof.analyst_minutes_saved = round(rejected * 4.5, 1)
    path_proof.unknowns_requiring_investigation = sum(
        1
        for n, d in g.nodes(data=True)
        if d.get("prerequisite_status") == "unknown"
        or d.get("applicability_status") == "candidate"
    )
    path_proof.max_blast_radius = max(
        (d.get("blast_radius", 0) for _, d in g.nodes(data=True)),
        default=0,
    )
    path_proof.rejected_path_proofs = [r["proof"] for r in rejected_records]
    if proof.graph_statistics:
        proof.graph_statistics.candidate_attack_paths = raw_count

    if not candidates:
        return [], proof

    # Deterministic ranking (Phase D): risk DESC, then confidence DESC,
    # criticality DESC, node_id ASC. Independent of discovery order so the
    # output is identical regardless of which search algorithm enumerated paths.
    def _rank_key(c):
        risk_v, path_v, conf_v = c[0], c[2], c[7]
        _, crit_w = classify_criticality(path_v[-1], g.nodes[path_v[-1]])
        return (-risk_v, -conf_v, -crit_w, path_v[-1])

    candidates.sort(key=_rank_key)
    paths = [
        _path_to_model(
            g,
            path,
            risk,
            detail,
            contributions,
            assets,
            node_data,
            hypothetical=hypothetical,
            survive_reasons=survive,
            conf_breakdown=conf_breakdown,
            validated_ids=validated_ids,
            rejected_samples=path_proof.rejected_path_reasons,
            risk_proof=risk_proof,
            rejected_records=rejected_records,
        )
        for risk, detail, path, contributions, hypothetical, survive, conf_breakdown, _path_conf, risk_proof in candidates[:MAX_PATHS]
    ]
    path_proof.path_classifications = [
        {
            "title": p.title,
            "attack_category": p.attack_category,
            "proof": p.attack_category_proof,
            "mitre_tactics": p.mitre_tactics,
            "mitre_techniques": p.mitre_techniques,
        }
        for p in paths
    ]
    return paths, proof


def _bucket_confidence(buckets: dict[str, int], conf: int) -> None:
    if conf >= 90:
        buckets["90+"] += 1
    elif conf >= 70:
        buckets["70-89"] += 1
    elif conf >= 50:
        buckets["50-69"] += 1
    else:
        buckets["0-49"] += 1


def _make_rejected_record(
    g: nx.DiGraph,
    path: list[str],
    label: str,
    reason_str: str,
    reject_reasons: list[str],
    node_data: dict[str, dict],
    assets: list[Asset],
    validated_ids: set[str],
    confidence_if_revived: int | None = None,
) -> dict:
    """Build a structured RejectedPathProof + alternative metadata for one path."""
    missing = missing_evidence_to_continue(path, node_data, assets)
    # Reject reasons frequently name the missing capability/evidence (e.g.
    # "execution -> data_access impossible: missing credential"); feed them to the
    # revival router so the suggestions line up with the actual blocker.
    missing_for_revival = list(dict.fromkeys(missing + list(reject_reasons)))
    if confidence_if_revived is None:
        confidence_if_revived = compute_path_confidence(
            g,
            path,
            multi_tool=_path_multi_tool(g, path),
            validated=_path_has_validated_finding(g, path, validated_ids),
        )[0]
    rp = build_rejected_proof(
        path=path,
        label=label,
        reject_reason=reason_str,
        missing_evidence=missing_for_revival,
        confidence_if_revived=confidence_if_revived,
    )
    return {
        "path": list(path),
        "label": label,
        "reason": reason_str,
        "entry": path[0],
        "terminal": path[-1],
        "confidence_if_revived": confidence_if_revived,
        "proof": rp.to_dict(),
    }


def _path_multi_tool(g: nx.DiGraph, path: list[str]) -> bool:
    tools: set[str] = set()
    for u, v in zip(path[:-1], path[1:]):
        tool = g.edges[u, v].get("source_tool", "")
        if tool:
            tools.add(tool.lower())
    return len(tools) >= 2


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
        if nid.startswith("vuln:"):
            for fid in g.nodes[nid].get("finding_ids", []):
                if fid in validated_ids:
                    return True
        if nid.startswith("cve_verified:"):
            return True
        if g.nodes[nid].get("applicability_status") == "verified":
            return True
    return False


def _entry_nodes(g: nx.DiGraph) -> list[str]:
    return [n for n, d in g.nodes(data=True) if d.get("is_entry")]


def _terminal_nodes(g: nx.DiGraph) -> list[str]:
    return [
        n
        for n, d in g.nodes(data=True)
        if is_terminal_target(n, d) and not d.get("is_entry")
    ]


def _path_to_model(
    g: nx.DiGraph,
    path: list[str],
    risk_score: float,
    risk_detail: str,
    contributions: list[int],
    assets: list[Asset],
    node_data: dict[str, dict],
    *,
    hypothetical: bool,
    survive_reasons: list[str],
    conf_breakdown: list[str],
    validated_ids: set[str],
    rejected_samples: list[str] | None = None,
    risk_proof: dict | None = None,
    rejected_records: list[dict] | None = None,
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
                evidence_tier=data.get("evidence_tier", "TIER1"),
                capability=data.get("capability", ""),
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
                evidence_tier=ed.get("evidence_tier", "TIER1"),
                evidence_type=ed.get("evidence_type", ed.get("artifact_type", "")),
                evidence_source=ed.get("evidence_source", ed.get("source_tool", "")),
                validation_checks_passed=list(ed.get("validation_checks", [])),
                exploitability=ed.get("exploitability", ""),
                privilege_gained=ed.get("privilege_gained", ""),
                confidence_proof=dict(ed.get("confidence_proof", {})),
            )
        )

    multi_tool = _path_multi_tool(g, path)
    path_conf, path_conf_breakdown, path_conf_proof = compute_path_confidence_with_proof(
        g,
        path,
        multi_tool=multi_tool,
        validated=_path_has_validated_finding(g, path, validated_ids),
    )
    hop_count = len(path) - 1
    effort, effort_calc = compute_attacker_effort(g, path)
    missing = missing_evidence_to_continue(path, node_data, assets)
    termination_message = build_termination_message(missing)

    path_explanation, confidence_explanation, expected_impact = build_path_analyst_explanation(
        g,
        path,
        survive_reasons=survive_reasons,
        conf_breakdown=path_conf_breakdown,
        confidence=path_conf,
        risk_score=risk_score,
        effort=effort,
        rejected_samples=rejected_samples,
    )

    capability_chain: list[str] = []
    for nid in path:
        cap = g.nodes[nid].get("capability", "")
        if cap and (not capability_chain or cap != capability_chain[-1]):
            capability_chain.append(cap)

    blast_info = path_blast_radius(g, path)
    term_cat, _ = classify_criticality(path[-1], g.nodes[path[-1]])

    # --- Phase G proof assembly -------------------------------------------
    effort_proof = {
        "effort": effort,
        "hop_count": hop_count,
        "calculation": effort_calc if isinstance(effort_calc, dict) else {"detail": str(effort_calc)},
    }
    blast_proof = dict(blast_info)

    # Alternatives: rejected paths that shared this path's terminal or entry.
    alt_records = [
        r
        for r in (rejected_records or [])
        if r.get("terminal") == path[-1] or r.get("entry") == path[0]
    ]
    alt_records.sort(key=lambda r: (-int(r.get("confidence_if_revived", 0)), r.get("label", "")))
    alternatives = [
        AlternativePath(
            path=r["path"],
            rejected_reason=r["reason"],
            confidence=int(r.get("confidence_if_revived", 0)),
        ).to_dict()
        for r in alt_records[:5]
    ]

    # Revival options: missing evidence on this (accepted but possibly
    # terminated) path, plus the revival routes from rejected alternatives.
    revival_options: list[dict] = list(suggest_revival(missing))
    _seen_rev = {(o["missing"], o["action"]) for o in revival_options}
    for r in alt_records[:5]:
        for o in r["proof"].get("revive_with", []):
            key = (o["missing"], o["action"])
            if key not in _seen_rev:
                _seen_rev.add(key)
                revival_options.append(o)

    why_accepted = list(survive_reasons)
    assumptions = [f"requires: {m}" for m in missing]
    if hypothetical:
        assumptions.append("path relies on hypothetical / candidate evidence (not fully verified)")
    accepted_proof = build_accepted_proof(
        why_accepted=why_accepted,
        confidence_proof=path_conf_proof,
        risk_proof=risk_proof or {},
        blast_proof=blast_proof,
        effort_proof=effort_proof,
        assumptions=assumptions,
        alternatives_rejected=alternatives,
    ).to_dict()

    # Phase H — deterministic attack category + MITRE (after confidence/risk).
    attack_category, category_proof, mitre_tactics, mitre_techniques = classify_attack_path(
        g, path, path_confidence=path_conf
    )

    scoring_dict = format_scoring_breakdown(
        edge_contributions=contributions,
        path_conf=path_conf,
        hops=hop_count,
        effort_calc=effort_calc,
        risk=risk_score,
        risk_detail=risk_detail,
    )
    scoring_dict["confidence_calculation"] = " | ".join(path_conf_breakdown)

    labels = [n.label for n in nodes]
    title = " → ".join(labels)
    if hypothetical:
        title = f"HYPOTHETICAL PATH: {title}"
    elif termination_message:
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
        is_hypothetical=hypothetical,
        path_explanation=path_explanation,
        confidence_explanation=confidence_explanation,
        expected_impact=expected_impact,
        rejection_context=[
            r.split("\n")[0] for r in (rejected_samples or [])[:3]
        ],
        capability_chain=capability_chain,
        blast_radius=blast_info["reachable_count"],
        terminal_criticality=term_cat,
        scoring=PathScoringBreakdown(**scoring_dict),
        confidence_proof=path_conf_proof,
        risk_proof=risk_proof or {},
        accepted_proof=accepted_proof,
        effort_proof=effort_proof,
        blast_proof=blast_proof,
        alternatives=alternatives,
        revival_options=revival_options,
        attack_category=attack_category,
        attack_category_proof=category_proof,
        mitre_tactics=mitre_tactics,
        mitre_techniques=mitre_techniques,
    )


def _node_risk(data: dict) -> str:
    nt = data.get("node_type", "")
    if nt in ("vulnerability", "identity", "credential", "database"):
        return "high"
    if nt == "software":
        return "medium"
    return "medium"
