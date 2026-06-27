"""Proof text export (Phase I)."""

from __future__ import annotations

from vayne.attack_paths.proof import GraphProof
from vayne.models import InvestigationReport


def render_proof_txt(report: InvestigationReport, graph_proof: GraphProof | None) -> str:
    lines = ["=== VAYNE PRODUCTION PROOF EXPORT ===", ""]

    if graph_proof:
        lines.extend(graph_proof.log_lines())
    elif report.proof_log:
        lines.extend(report.proof_log)

    lines.extend(["", "=== ATTACK PATH PROOFS ===", ""])
    for i, p in enumerate(report.attack_paths, 1):
        lines.extend([
            f"PATH {i} [{p.attack_category}]",
            f"  confidence: {p.confidence}%",
            f"  risk: {p.risk_score}",
            f"  MITRE tactics: {', '.join(p.mitre_tactics)}",
            f"  story: {p.attack_story.get('narrative', '') if p.attack_story else p.title}",
        ])
        for expl in p.attack_category_proof.get("explanation", []):
            lines.append(f"  category: {expl}")

    if report.attack_surface_proof:
        lines.extend([
            "",
            "=== ATTACK SURFACE SCORE ===",
            f"  score: {report.attack_surface_score}/100 ({report.attack_surface_classification})",
        ])
        for f in report.attack_surface_proof.get("factors", []):
            lines.append(f"  factor {f['name']}: {f['contribution']}")

    return "\n".join(lines)
