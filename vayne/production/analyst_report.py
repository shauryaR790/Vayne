"""Analyst-grade report generation (Phase I)."""

from __future__ import annotations

from vayne.attack_paths.proof import GraphProof
from vayne.models import InvestigationReport


def render_analyst_report(report: InvestigationReport, graph_proof: GraphProof | None) -> str:
    lines = ["# Analyst Report", ""]

    lines.extend(["## GRAPH STATISTICS", ""])
    if graph_proof and graph_proof.graph_statistics:
        gs = graph_proof.graph_statistics
        lines.extend([
            f"- Connected components: {gs.connected_components}",
            f"- Average degree: {gs.average_degree}",
            f"- Reachable nodes: {gs.reachable_nodes}",
            f"- Candidate attack paths enumerated: {gs.candidate_attack_paths}",
        ])
    else:
        lines.append("- Graph statistics not available")

    lines.extend(["", "## CONFIDENCE PROOFS", ""])
    for i, p in enumerate(report.attack_paths, 1):
        lines.append(f"### Path {i} — {p.attack_category} (confidence {p.confidence}%)")
        cp = p.confidence_proof
        lines.append(f"- Formula: {cp.get('formula', 'n/a')}")
        for f in cp.get("factors", [])[:8]:
            lines.append(f"  - {f.get('name')}: contribution {f.get('contribution')}")

    lines.extend(["", "## RISK PROOFS", ""])
    for i, p in enumerate(report.attack_paths, 1):
        lines.append(f"### Path {i} — {p.attack_category} (risk {p.risk_score})")
        for f in p.risk_proof.get("factors", [])[:10]:
            lines.append(f"  - {f.get('name')}: weight {f.get('weight')} → {f.get('contribution')}")

    lines.extend(["", "## REJECTED PATHS", ""])
    if graph_proof and graph_proof.path_discovery:
        for rp in graph_proof.path_discovery.rejected_path_proofs[:10]:
            lines.append(f"- {rp.get('label', 'path')}: {rp.get('reject_reason', '')}")
        if not graph_proof.path_discovery.rejected_path_proofs:
            lines.append("- No paths rejected in this investigation")
    else:
        lines.append("- Rejection data not available")

    lines.extend(["", "## MITRE MAPPINGS", ""])
    for i, p in enumerate(report.attack_paths, 1):
        lines.append(f"### Path {i} [{p.attack_category}]")
        for t in p.mitre_tactics:
            lines.append(f"  - Tactic: {t}")
        for t in p.mitre_techniques:
            lines.append(f"  - Technique: {t}")

    lines.extend(["", "## EVIDENCE CHAINS", ""])
    for p in report.attack_paths:
        lines.append(f"### {p.title[:80]}")
        for edge in p.edges:
            lines.append(
                f"  - {edge.source_id} → {edge.target_id} "
                f"[{edge.relationship}] conf={edge.confidence}% tier={edge.evidence_tier}"
            )

    lines.extend(["", "## CAPABILITY CHAINS", ""])
    for i, p in enumerate(report.attack_paths, 1):
        lines.append(f"- Path {i}: {' → '.join(p.capability_chain) or 'none'}")

    lines.extend(["", "## ATTACK CATEGORY PROOFS", ""])
    for p in report.attack_paths:
        cp = p.attack_category_proof
        lines.append(f"### {p.attack_category}")
        for expl in cp.get("explanation", []):
            lines.append(f"  - {expl}")

    lines.extend(["", "## BLAST RADIUS", ""])
    for i, p in enumerate(report.attack_paths, 1):
        lines.append(
            f"- Path {i}: {p.blast_radius} reachable assets "
            f"(terminal criticality: {p.terminal_criticality})"
        )

    lines.extend(["", "## REMEDIATION RATIONALE", ""])
    lines.append(
        "Remediation items are derived from deterministic rules keyed to "
        "software fingerprints, node types, and attack categories on each path."
    )

    return "\n".join(lines)
