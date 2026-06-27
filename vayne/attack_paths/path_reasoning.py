"""Path validation, confidence, effort, and analyst explanations."""

from __future__ import annotations

import networkx as nx

from vayne.attack_paths.capabilities import (
    capability_for_node,
    chain_is_logical,
    transitions_are_valid,
)
from vayne.attack_paths.confidence_model import (
    compute_path_confidence_multiplicative,
)
from vayne.attack_paths.confidence_model import MULTI_TOOL_CORROBORATION_POINTS
from vayne.attack_paths.terminals import is_terminal_target, termination_reasons
from vayne.models import AttackCapability, EvidenceTier


def path_has_tier3(path: list[str], g: nx.DiGraph) -> bool:
    for u, v in zip(path[:-1], path[1:]):
        if g.edges[u, v].get("evidence_tier") == EvidenceTier.TIER3.value:
            return True
    for nid in path:
        if g.nodes[nid].get("evidence_tier") == EvidenceTier.TIER3.value:
            return True
    return False


def path_all_tier1(path: list[str], g: nx.DiGraph) -> bool:
    for u, v in zip(path[:-1], path[1:]):
        if g.edges[u, v].get("evidence_tier") != EvidenceTier.TIER1.value:
            return False
    for nid in path:
        tier = g.nodes[nid].get("evidence_tier", EvidenceTier.TIER1.value)
        if tier != EvidenceTier.TIER1.value:
            return False
    return True


def validate_path_hop(g: nx.DiGraph, u: str, v: str) -> tuple[bool, list[str]]:
    if not g.has_edge(u, v):
        return False, ["missing edge"]
    ed = g.edges[u, v]
    issues: list[str] = []
    if not ed.get("finding_id") or not str(ed.get("evidence", "")).strip():
        issues.append("no evidence artifact")
    if not ed.get("discovered_from"):
        issues.append("no discovered_from proof")
    checks = ed.get("validation_checks") or []
    if not checks:
        issues.append("no validation checks")
    if ed.get("evidence_tier") == EvidenceTier.TIER3.value:
        issues.append("TIER3 inferred edge")
    if not ed.get("reachable", True) and "target reachable" not in checks:
        pass  # inventory edges may lack reachable — allowed for tier1 scan
    return len(issues) == 0, issues


def validate_full_path(
    g: nx.DiGraph,
    path: list[str],
    validated_finding_ids: set[str],
) -> tuple[bool, bool, list[str], list[str]]:
    """Returns (accepted, hypothetical, reject_reasons, survival_reasons)."""
    reject: list[str] = []
    survive: list[str] = []

    if len(path) < 2:
        return False, False, ["path too short"], []

    for u, v in zip(path[:-1], path[1:]):
        ok, issues = validate_path_hop(g, u, v)
        if not ok:
            reject.extend(issues)

    has_validated = False
    has_verified_exploit = False
    for nid in path:
        nd = g.nodes[nid]
        if nid.startswith("vuln:"):
            for fid in nd.get("finding_ids", []):
                if fid in validated_finding_ids:
                    has_validated = True
        if nd.get("applicability_status") == "verified":
            has_verified_exploit = True
        if nd.get("prerequisite_status") == "unknown" and nid.startswith("prereq:"):
            if not any(
                g.nodes[n].get("applicability_status") == "verified"
                for n in path
                if n.startswith("cve_verified:")
            ):
                reject.append(f"unverified prerequisite: {nd.get('label', nid)}")

    if not has_validated and not has_verified_exploit:
        reject.append("no validated finding or verified exploit intelligence on path")

    node_data = {n: dict(g.nodes[n]) for n in path}
    terminal_nd = node_data[path[-1]]
    if terminal_nd.get("applicability_status") in ("candidate", "partial"):
        reject.append("path ends at CVE candidate — applicability not verified")
    if path[-1].startswith("prereq:") or path[-1].startswith("cve_cand:"):
        reject.append("path ends before verified exploit applicability")
    if path[-1].startswith("exploit:") and not path[-1].startswith("access:"):
        reject.append("path ends at exploit node without access outcome")

    if not is_terminal_target(path[-1], node_data[path[-1]]):
        reject.extend(termination_reasons(path, node_data))

    caps: list[AttackCapability] = [AttackCapability.INITIAL_ACCESS]
    for nid in path[1:]:
        nd = g.nodes[nid]
        nt = nd.get("node_type", "")
        override = nd.get("capability", "")
        if nt == "endpoint" and not override:
            continue
        if nt in ("asset", "service", "software") and not override:
            continue
        cap = capability_for_node(nt, override)
        if cap and (not caps or cap != caps[-1]):
            caps.append(cap)

    logical, cap_issues = chain_is_logical(caps)
    if not logical:
        reject.extend(cap_issues)

    # Capability transition matrix (Step B): reject logically impossible
    # capability transitions (e.g. initial_access -> domain_compromise).
    # Validation layer only — does not alter path discovery/ordering.
    transitions_ok, transition_issues = transitions_are_valid(caps)
    if not transitions_ok:
        reject.extend(transition_issues)

    if "host verified" in str(g.edges[path[0], path[1]].get("validation_checks")):
        survive.append("host reachable")
    if has_verified_exploit or has_validated:
        survive.append("exploit available")
    if any(g.nodes[n].get("node_type") == "credential" for n in path):
        survive.append("credentials exposed")
    if any(g.nodes[n].get("node_type") == "identity" for n in path):
        survive.append("privilege escalation possible")
    if is_terminal_target(path[-1], node_data[path[-1]]):
        survive.append("target reachable")

    hypothetical = path_has_tier3(path, g)

    accepted = len(reject) == 0
    return accepted, hypothetical, reject, survive


def compute_path_confidence(
    g: nx.DiGraph,
    path: list[str],
    *,
    multi_tool: bool,
    validated: bool,
) -> tuple[int, list[str]]:
    conf, breakdown, _proof = compute_path_confidence_with_proof(
        g, path, multi_tool=multi_tool, validated=validated
    )
    return conf, breakdown


def compute_path_confidence_with_proof(
    g: nx.DiGraph,
    path: list[str],
    *,
    multi_tool: bool,
    validated: bool,
) -> tuple[int, list[str], dict]:
    """Path confidence + a serialized ConfidenceProof (Step 5)."""
    edge_confidences: list[int] = []
    exploit_edges: list[int] = []
    infra_edges: list[int] = []
    weaponized = False
    exact_version = False

    for u, v in zip(path[:-1], path[1:]):
        ed = g.edges[u, v]
        conf = ed.get("confidence_contribution", 0)
        edge_confidences.append(conf)
        artifact = ed.get("artifact_type", "")
        if artifact in ("cve_verified", "cve_enrichment", "access_outcome") or ed.get(
            "source_tool"
        ) == "exploit_intel":
            exploit_edges.append(conf)
        else:
            infra_edges.append(conf)

    for nid in path:
        nd = g.nodes[nid]
        if nd.get("exploit_maturity") == "weaponized":
            weaponized = True
        if nid.startswith("software:") and nd.get("version"):
            exact_version = True

    has_verified = any(
        g.nodes[nid].get("applicability_status") == "verified" for nid in path
    ) or validated

    confidence, breakdown, proof = compute_path_confidence_multiplicative(
        edge_confidences,
        all_tier1=path_all_tier1(path, g),
        has_verified_exploit=has_verified,
        exploit_edge_confidences=exploit_edges,
        infra_edge_confidences=infra_edges,
        weaponized=weaponized,
        exact_version=exact_version,
    )
    if multi_tool:
        before = confidence
        confidence = min(100, confidence + MULTI_TOOL_CORROBORATION_POINTS)
        breakdown.append(f"+{MULTI_TOOL_CORROBORATION_POINTS} multi-tool corroboration")
        proof.add(
            "corroboration",
            float(MULTI_TOOL_CORROBORATION_POINTS),
            confidence - before,
            evidence=["≥2 independent tools corroborate this path"],
        )
        proof.finalize(raw_score=proof.raw_score, normalized_score=confidence)
    return confidence, breakdown, proof.to_dict()


def compute_attacker_effort(g: nx.DiGraph, path: list[str]) -> tuple[str, str]:
    hops = len(path) - 1
    auth_required = False
    public_poc = False
    priv_esc = 0
    for nid in path:
        nd = g.nodes[nid]
        if nd.get("auth_required"):
            auth_required = True
        if nd.get("public_poc"):
            public_poc = True
        if nd.get("node_type") == "identity":
            priv_esc += 1

    score = hops
    if auth_required:
        score += 2
    if not public_poc:
        score += 2
    score += priv_esc

    if score <= 2 and public_poc and not auth_required:
        return "trivial", f"score={score} (public PoC, no auth, {hops} hops)"
    if score <= 4:
        return "low", f"score={score} ({hops} hops)"
    if score <= 7:
        return "moderate", f"score={score} ({hops} hops, auth={auth_required})"
    if score <= 10:
        return "high", f"score={score} ({hops} hops, priv_esc={priv_esc})"
    return "very high", f"score={score} ({hops} hops, auth={auth_required}, no public PoC)"


def build_path_analyst_explanation(
    g: nx.DiGraph,
    path: list[str],
    *,
    survive_reasons: list[str],
    conf_breakdown: list[str],
    confidence: int,
    risk_score: float,
    effort: str,
    rejected_samples: list[str] | None = None,
) -> tuple[list[str], list[str], str]:
    """Analyst-grade narrative: validity, evidence, impact, confidence, rejections."""
    validity: list[str] = []
    if survive_reasons:
        validity.append(f"Path accepted: {'; '.join(survive_reasons)}")

    verified_cves = [
        g.nodes[nid].get("label", nid)
        for nid in path
        if nid.startswith("cve_verified:")
    ]
    if verified_cves:
        validity.append(f"Verified CVE applicability: {', '.join(verified_cves)}")

    prereqs_met: list[str] = []
    for nid in path:
        if nid.startswith("prereq:"):
            nd = g.nodes[nid]
            if nd.get("prerequisite_status") == "verified":
                prereqs_met.append(nd.get("label", nid))
    if prereqs_met:
        validity.append(f"Exploit prerequisites satisfied: {', '.join(prereqs_met)}")
    elif any(nid.startswith("cve_verified:") for nid in path):
        validity.append(
            "Exploit prerequisites satisfied via exact version/port fingerprint match"
        )

    edge_evidence: list[str] = []
    for u, v in zip(path[:-1], path[1:]):
        ed = g.edges[u, v]
        src_label = g.nodes[u].get("label", u.split(":")[-1])
        tgt_label = g.nodes[v].get("label", v.split(":")[-1])
        ev = str(ed.get("evidence", ""))[:120]
        checks = ed.get("validation_checks") or []
        check_str = ", ".join(checks[:4]) if checks else "evidence-backed"
        edge_evidence.append(f"{src_label} → {tgt_label}: {ev} [{check_str}]")

    terminal = g.nodes[path[-1]]
    terminal_label = terminal.get("label", path[-1])
    if terminal.get("is_exploit_outcome") or "shell" in terminal_label.lower():
        impact = f"Expected impact: remote code execution / shell access ({terminal_label})"
    elif terminal.get("node_type") == "database":
        impact = f"Expected impact: database compromise ({terminal_label})"
    elif terminal.get("node_type") in ("credential", "identity"):
        impact = f"Expected impact: credential or privilege abuse ({terminal_label})"
    else:
        impact = f"Expected impact: compromise of {terminal_label}"

    cvss_vals = [g.nodes[n].get("cvss") for n in path if g.nodes[n].get("cvss")]
    if cvss_vals:
        impact += f"; CVSS up to {max(cvss_vals)}"

    conf_lines = [f"Path confidence: {confidence}%"] + conf_breakdown[:6]
    conf_lines.append(f"Attacker effort: {effort}")
    conf_lines.append(f"Risk score: {risk_score}/10")

    rejections: list[str] = []
    if rejected_samples:
        for sample in rejected_samples[:3]:
            first_line = sample.split("\n")[0]
            if first_line and first_line not in rejections:
                rejections.append(first_line)

    narrative = validity + edge_evidence[:5]
    return narrative, conf_lines, impact
