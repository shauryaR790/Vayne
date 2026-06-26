"""Risk scoring — evidence-weighted exploitability model."""

from __future__ import annotations

import networkx as nx

from vayne.attack_paths.formulas import path_confidence


def score_path(g: nx.DiGraph, path: list[str]) -> tuple[float, str, list[int]]:
    if len(path) < 2:
        return 0.0, "0 — path too short", []

    contributions: list[int] = []
    for u, v in zip(path[:-1], path[1:]):
        data = g.edges[u, v]
        contrib = data.get("confidence_contribution", data.get("confidence", 0))
        contributions.append(contrib)

    path_conf = path_confidence(contributions)
    confidence_factor = path_conf / 100.0
    exploitability = path_conf / 10.0

    privilege_gain = 1.0
    asset_criticality = 1.0
    for nid in path:
        nt = g.nodes[nid].get("node_type", "")
        if nt == "identity":
            label = g.nodes[nid].get("label", "").lower()
            privilege_gain = max(privilege_gain, 3.0 if "admin" in label else 2.5)
        elif nt == "credential":
            privilege_gain = max(privilege_gain, 2.0)
        elif nt in ("database", "bucket", "data"):
            asset_criticality = max(asset_criticality, 2.5)
        elif nt == "vulnerability":
            label = g.nodes[nid].get("label", "").upper()
            if label.startswith("CVE-"):
                asset_criticality = max(asset_criticality, 2.0)

    risk = round(
        min(10.0, exploitability * privilege_gain * asset_criticality * confidence_factor),
        1,
    )
    detail = (
        f"exploitability={exploitability:.2f}, privilege_gain={privilege_gain:.2f}, "
        f"asset_criticality={asset_criticality:.2f}, confidence={path_conf}%; "
        f"risk = {exploitability:.2f} * {privilege_gain:.2f} * {asset_criticality:.2f} * "
        f"{confidence_factor:.2f} = {risk}"
    )
    return risk, detail, contributions
