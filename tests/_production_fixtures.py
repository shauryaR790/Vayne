"""Shared fixtures for Phase I production-layer tests."""

from __future__ import annotations

from pathlib import Path

from vayne.orchestrator.pipeline import Orchestrator

METASPLOIT = Path(__file__).parent.parent / "examples" / "metasploit.xml"


def run_metasploit_export(tmp_path: Path):
    """Run full pipeline on Metasploitable and export production artifacts."""
    export_dir = tmp_path / "reports"
    report = Orchestrator("phase-i-test", [METASPLOIT], proof=True).run(export_dir=export_dir)
    return report, export_dir


def parity_signature(report) -> dict:
    """Core parity fields — must not change across phases."""
    return {
        "path_count": len(report.attack_paths),
        "confidences": sorted(p.confidence for p in report.attack_paths),
        "risks": sorted(p.risk_score for p in report.attack_paths),
        "node_sequences": [
            [n.id for n in p.nodes] for p in report.attack_paths
        ],
    }
