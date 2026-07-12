"""Production export orchestrator (Phase I)."""

from __future__ import annotations

import json
from pathlib import Path

from vayne.attack_paths.proof import GraphProof
from vayne.intelligence import build_investigation_intelligence
from vayne.models import AttackPath, InvestigationReport
from vayne.production.analyst_report import render_analyst_report
from vayne.production.attack_story import generate_attack_story, render_attack_story_md
from vayne.production.attack_surface import compute_attack_surface_score
from vayne.production.executive_report import render_executive_report
from vayne.production.graph_export import export_attack_paths_json, export_graph_json
from vayne.production.proof_export import render_proof_txt
from vayne.production.remediation_plan import (
    export_findings,
    generate_remediation_plan,
    render_remediation_md,
)
from vayne.reporting.generator import export_report


def enrich_attack_paths(paths: list[AttackPath]) -> list[AttackPath]:
    """Attach attack_story to each path without altering scores or ordering."""
    enriched: list[AttackPath] = []
    for p in paths:
        story = generate_attack_story(p)
        enriched.append(p.model_copy(update={"attack_story": story}))
    return enriched


def enrich_report(
    report: InvestigationReport,
    graph_proof: GraphProof | None,
) -> InvestigationReport:
    """Add production-layer fields to the report (additive only)."""
    paths = enrich_attack_paths(report.attack_paths)
    score, label, surface_proof = compute_attack_surface_score(
        report.model_copy(update={"attack_paths": paths})
    )
    return report.model_copy(
        update={
            "attack_paths": paths,
            "attack_surface_score": score,
            "attack_surface_classification": label,
            "attack_surface_proof": surface_proof,
            "graph_proof": graph_proof.model_dump(mode="json") if graph_proof else {},
        }
    )


def export_production_artifacts(
    report: InvestigationReport,
    graph_proof: GraphProof | None,
    output_dir: Path,
) -> dict[str, Path]:
    """Write all Phase I production artifacts alongside legacy investigation export."""
    output_dir.mkdir(parents=True, exist_ok=True)
    enriched = enrich_report(report, graph_proof)

    # Legacy exports (investigation.json/html/md) use enriched report.
    paths = export_report(enriched, output_dir)

    remediation = generate_remediation_plan(enriched)

    artifacts = {
        "attack_paths.json": output_dir / "attack_paths.json",
        "graph.json": output_dir / "graph.json",
        "findings.json": output_dir / "findings.json",
        "executive_report.md": output_dir / "executive_report.md",
        "analyst_report.md": output_dir / "analyst_report.md",
        "attack_story.md": output_dir / "attack_story.md",
        "remediation_plan.md": output_dir / "remediation_plan.md",
        "remediation_plan.json": output_dir / "remediation_plan.json",
        "proof.txt": output_dir / "proof.txt",
    }

    artifacts["attack_paths.json"].write_text(
        json.dumps(export_attack_paths_json(enriched), indent=2),
        encoding="utf-8",
    )
    artifacts["graph.json"].write_text(
        json.dumps(export_graph_json(enriched, graph_proof), indent=2),
        encoding="utf-8",
    )
    artifacts["findings.json"].write_text(
        json.dumps(export_findings(enriched), indent=2),
        encoding="utf-8",
    )
    artifacts["executive_report.md"].write_text(
        render_executive_report(enriched), encoding="utf-8"
    )
    artifacts["analyst_report.md"].write_text(
        render_analyst_report(enriched, graph_proof), encoding="utf-8"
    )
    artifacts["attack_story.md"].write_text(
        render_attack_story_md(enriched.attack_paths), encoding="utf-8"
    )
    artifacts["remediation_plan.md"].write_text(
        render_remediation_md(remediation), encoding="utf-8"
    )
    artifacts["remediation_plan.json"].write_text(
        json.dumps(remediation, indent=2), encoding="utf-8"
    )
    artifacts["proof.txt"].write_text(
        render_proof_txt(enriched, graph_proof), encoding="utf-8"
    )

    # Phase 2/3 — Facts Before LLM. The engine emits its structured intelligence
    # artifacts (including the full autonomous investigation and rejected-path
    # reasoning); the LLM narrator may only explain these files.
    intelligence = build_investigation_intelligence(enriched, graph_proof)
    phase2 = {
        "facts.json": intelligence["facts"],
        "confidence.json": intelligence["confidence"],
        "reasoning.json": intelligence["reasoning"],
        "evidence_graph.json": intelligence["graph"],
        "timeline.json": intelligence["timeline"],
        "recommendations.json": intelligence["recommendations"],
        "conflicts.json": intelligence["conflicts"],
        "investigations.json": intelligence["investigations"],
        "rejected_paths.json": intelligence["rejected_paths"],
        # Phase 4 — ground-truth validation loop + probability calibration status.
        "validation.json": intelligence["validation"],
        "calibration.json": intelligence["calibration"],
        "review.json": intelligence["review"],
    }
    for name, payload in phase2.items():
        target = output_dir / name
        target.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        artifacts[name] = target

    paths.update(artifacts)
    return paths
