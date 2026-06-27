"""Black-box VAYNE engine runner — does NOT reimplement any engine logic."""

from __future__ import annotations

from pathlib import Path

from vayne.models import InvestigationReport
from vayne.orchestrator.pipeline import Orchestrator


def analyze(
    name: str,
    uploaded_files: list[Path],
    export_dir: Path,
    *,
    proof: bool = True,
) -> InvestigationReport:
    """Run VAYNE Core and write production exports to export_dir."""
    orch = Orchestrator(name, uploaded_files, proof=proof)
    return orch.run(export_dir=export_dir)
