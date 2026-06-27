"""Risk scoring — analyst-calibrated exploitability with CVSS and maturity."""

from __future__ import annotations

import networkx as nx

from vayne.attack_paths.asset_criticality import classify_criticality
from vayne.attack_paths.formulas import path_confidence
from vayne.attack_paths.risk_proof import RiskProof

MATURITY_RISK: dict[str, float] = {
    "weaponized": 1.0,
    "functional": 0.92,
    "poc": 0.78,
    "theoretical": 0.55,
    "unknown": 0.65,
}

# ---------------------------------------------------------------------------
# Phase F: expanded risk dimensions. Each factor defaults to 1.0 (neutral) when
# its evidence is absent. Metasploitable paths are pure unauthenticated RCE with
# no high-value assets / identities / lateral / persistence, so every new factor
# is 1.0 there and the risk values {6.5,7.2,8.6,8.6} are preserved exactly.
# All weights are named, documented constants surfaced in the RiskProof.
# ---------------------------------------------------------------------------
BUSINESS_CRITICALITY_WEIGHTS: dict[str, float] = {
    "database": 1.25, "rds": 1.30, "redis": 1.20, "storage": 1.20,
    "bucket": 1.25, "domain": 1.50, "admin": 1.40, "iam_role": 1.30,
    "kubernetes": 1.35, "secret": 1.25,
}
DATA_SENSITIVITY_WEIGHTS: dict[str, float] = {
    "credential": 1.20, "jwt": 1.15, "secret": 1.25, "api_key": 1.20,
    "ssh_key": 1.20, "session": 1.10, "data": 1.20, "database": 1.20,
    "rds": 1.25, "bucket": 1.20,
}
IDENTITY_IMPACT_WEIGHTS: dict[str, float] = {
    "iam_role": 1.30, "admin": 1.40, "domain": 1.50, "role": 1.20,
    "service_account": 1.25, "identity": 1.25,
}
PERSISTENCE_WEIGHTS: dict[str, float] = {
    "service_account": 1.15, "iam_role": 1.20, "domain": 1.25,
}
PERSISTENCE_MARKERS: tuple[str, ...] = ("cron", "scheduled task", "systemd", "autostart", "persistence")
LATERAL_MARKERS: tuple[str, ...] = (
    "credential reuse", "ssh pivot", "assume role", "trust relationship", "lateral movement",
)
LATERAL_FACTOR = 1.40  # applied when lateral-movement evidence is present

RISK_FORMULA = (
    "risk = min(10, cvss_base × maturity_factor × access_factor × auth_factor "
    "× evidence_factor × blast_factor × privilege_factor × business_criticality "
    "× data_sensitivity × identity_impact × lateral_movement × persistence)"
)


def _max_weight_for_types(g: nx.DiGraph, path: list[str], weights: dict[str, float]) -> tuple[float, list[str]]:
    factor = 1.0
    evidence: list[str] = []
    for nid in path:
        nt = g.nodes[nid].get("node_type", "")
        if nt in weights and weights[nt] > factor:
            factor = weights[nt]
        if nt in weights:
            evidence.append(f"{nt}: {g.nodes[nid].get('label', nid)}")
    return factor, evidence


def _lateral_factor(g: nx.DiGraph, path: list[str]) -> tuple[float, list[str]]:
    for nid in path:
        nd = g.nodes[nid]
        if nd.get("capability") == "lateral_movement":
            return LATERAL_FACTOR, [f"lateral capability: {nd.get('label', nid)}"]
        blob = " ".join(str(e) for e in nd.get("evidence", [])).lower()
        for m in LATERAL_MARKERS:
            if m in blob:
                return LATERAL_FACTOR, [f"lateral marker '{m}': {nd.get('label', nid)}"]
    return 1.0, []


def _persistence_factor(g: nx.DiGraph, path: list[str]) -> tuple[float, list[str]]:
    factor, evidence = _max_weight_for_types(g, path, PERSISTENCE_WEIGHTS)
    for nid in path:
        blob = " ".join(str(e) for e in g.nodes[nid].get("evidence", [])).lower()
        for m in PERSISTENCE_MARKERS:
            if m in blob and factor < 1.15:
                factor = 1.15
                evidence.append(f"persistence marker '{m}': {g.nodes[nid].get('label', nid)}")
    return factor, evidence


def _path_exploit_metadata(g: nx.DiGraph, path: list[str]) -> dict:
    cvss_max = 0.0
    maturity = "unknown"
    auth_required = False
    public_poc = False
    remote_access = path[0].startswith("entry:")
    verified_exploit = False
    rce_outcome = False

    for nid in path:
        nd = g.nodes[nid]
        cvss_max = max(cvss_max, float(nd.get("cvss") or 0))
        if nd.get("exploit_maturity"):
            mat = nd.get("exploit_maturity", "")
            if MATURITY_RISK.get(mat, 0) >= MATURITY_RISK.get(maturity, 0):
                maturity = mat
        if nd.get("auth_required"):
            auth_required = True
        if nd.get("public_poc"):
            public_poc = True
        if nd.get("applicability_status") == "verified":
            verified_exploit = True
        if nd.get("is_exploit_outcome") or "shell" in nd.get("label", "").lower():
            rce_outcome = True
        cap = nd.get("capability", "")
        if cap in ("code_execution", "remote_code_execution"):
            rce_outcome = True

    return {
        "cvss_max": cvss_max,
        "maturity": maturity,
        "auth_required": auth_required,
        "public_poc": public_poc,
        "remote_access": remote_access,
        "verified_exploit": verified_exploit,
        "rce_outcome": rce_outcome,
    }


def score_path(
    g: nx.DiGraph, path: list[str]
) -> tuple[float, str, list[int], dict]:
    if len(path) < 2:
        return 0.0, "0 — path too short", [], RiskProof(formula=RISK_FORMULA).to_dict()

    contributions: list[int] = []
    for u, v in zip(path[:-1], path[1:]):
        data = g.edges[u, v]
        contrib = data.get("confidence_contribution", data.get("confidence", 0))
        contributions.append(contrib)

    path_conf = path_confidence(contributions)
    meta = _path_exploit_metadata(g, path)

    cvss_base = meta["cvss_max"] / 10.0 if meta["cvss_max"] > 0 else path_conf / 10.0
    if meta["verified_exploit"] and meta["rce_outcome"] and cvss_base < 7.5:
        cvss_base = max(cvss_base, 8.5)

    maturity_factor = MATURITY_RISK.get(meta["maturity"], 0.65)
    access_factor = 1.05 if meta["remote_access"] else 0.85
    auth_factor = 0.88 if meta["auth_required"] else 1.0
    if meta["auth_required"] and meta["public_poc"]:
        auth_factor = 0.92

    evidence_factor = 0.72 + (path_conf / 100.0) * 0.28

    privilege_gain = 1.0
    terminal_category = "unknown"
    for nid in path:
        nd = g.nodes[nid]
        cat, weight = classify_criticality(nid, nd)
        if nid == path[-1]:
            terminal_category = cat
        if nd.get("node_type") == "identity":
            privilege_gain = max(privilege_gain, min(3.5, weight / 3.0))
        elif nd.get("node_type") == "credential":
            privilege_gain = max(privilege_gain, min(2.5, weight / 3.5))

    blast = g.nodes[path[-1]].get("blast_radius", 1)
    blast_factor = min(1.15, 1.0 + (blast - 1) * 0.004)

    # Phase F expanded dimensions — neutral (1.0) when their evidence is absent.
    business_factor, business_ev = _max_weight_for_types(g, path, BUSINESS_CRITICALITY_WEIGHTS)
    data_factor, data_ev = _max_weight_for_types(g, path, DATA_SENSITIVITY_WEIGHTS)
    identity_factor, identity_ev = _max_weight_for_types(g, path, IDENTITY_IMPACT_WEIGHTS)
    lateral_factor, lateral_ev = _lateral_factor(g, path)
    persistence_factor, persistence_ev = _persistence_factor(g, path)

    product = (
        cvss_base
        * maturity_factor
        * access_factor
        * auth_factor
        * evidence_factor
        * blast_factor
        * privilege_gain
        * business_factor
        * data_factor
        * identity_factor
        * lateral_factor
        * persistence_factor
    )
    risk = round(min(10.0, product), 1)

    floor_applied = ""
    if meta["verified_exploit"] and meta["rce_outcome"] and not meta["auth_required"]:
        if meta["maturity"] == "weaponized" and risk < 8.5:
            risk = 8.5
            floor_applied = "verified weaponized unauthenticated RCE floor (8.5)"
        elif meta["maturity"] == "functional" and risk < 7.0:
            risk = 7.0
            floor_applied = "verified functional unauthenticated RCE floor (7.0)"

    detail = (
        f"cvss_base={cvss_base:.2f} (cvss={meta['cvss_max']}), "
        f"maturity={meta['maturity']} ({maturity_factor:.2f}), "
        f"access={'remote' if meta['remote_access'] else 'local'} ({access_factor:.2f}), "
        f"auth={'required' if meta['auth_required'] else 'none'} ({auth_factor:.2f}), "
        f"evidence={path_conf}% ({evidence_factor:.2f}), "
        f"blast={blast} ({blast_factor:.2f}), "
        f"privilege={privilege_gain:.2f} ({terminal_category}); "
        f"risk = {cvss_base:.2f} × {maturity_factor:.2f} × {access_factor:.2f} × "
        f"{auth_factor:.2f} × {evidence_factor:.2f} × {blast_factor:.2f} × "
        f"{privilege_gain:.2f} = {risk}"
    )

    # Build the RiskProof: running product, every factor named with its evidence.
    proof = RiskProof(formula=RISK_FORMULA)
    running = 1.0
    cvss_ev = [f"max CVSS along path = {meta['cvss_max']}"]
    if meta["verified_exploit"] and meta["rce_outcome"]:
        cvss_ev.append("verified RCE outcome")
    running *= cvss_base
    proof.add("cvss_base", cvss_base, running, cvss_ev)
    running *= maturity_factor
    proof.add("exploit_maturity", maturity_factor, running, [f"maturity={meta['maturity']}"])
    running *= access_factor
    proof.add(
        "access_vector", access_factor, running,
        ["remote access" if meta["remote_access"] else "local access"],
    )
    running *= auth_factor
    proof.add(
        "authentication", auth_factor, running,
        ["auth required" if meta["auth_required"] else "no auth required"]
        + (["public PoC"] if meta["public_poc"] else []),
    )
    running *= evidence_factor
    proof.add("evidence_strength", evidence_factor, running, [f"path confidence={path_conf}%"])
    running *= blast_factor
    proof.add("blast_radius", blast_factor, running, [f"terminal blast radius={blast} assets"])
    running *= privilege_gain
    proof.add(
        "privilege_gain", privilege_gain, running,
        [f"terminal criticality={terminal_category}"],
    )
    running *= business_factor
    proof.add("business_criticality", business_factor, running, business_ev or ["no high-value asset on path"])
    running *= data_factor
    proof.add("data_sensitivity", data_factor, running, data_ev or ["no sensitive data on path"])
    running *= identity_factor
    proof.add("identity_impact", identity_factor, running, identity_ev or ["no identity escalation on path"])
    running *= lateral_factor
    proof.add("lateral_movement", lateral_factor, running, lateral_ev or ["no lateral movement on path"])
    running *= persistence_factor
    proof.add("persistence", persistence_factor, running, persistence_ev or ["no persistence on path"])
    if floor_applied:
        proof.add("verified_rce_floor", risk, risk, [floor_applied])
    proof.explanation = [detail]
    proof.finalize(raw_score=product, normalized_score=risk)

    return risk, detail, contributions, proof.to_dict()
