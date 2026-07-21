"""Black-box VAYNE engine runner — does NOT reimplement any engine logic."""

from __future__ import annotations

from pathlib import Path
from typing import Callable

from vayne.models import InvestigationReport
from vayne.orchestrator.pipeline import Orchestrator

StageCallback = Callable[[int, str, str], None]


def analyze(
    name: str,
    uploaded_files: list[Path],
    export_dir: Path,
    *,
    proof: bool = True,
    on_stage: StageCallback | None = None,
    cache_dir: Path | None = None,
) -> InvestigationReport:
    """Run VAYNE Core and write production exports to export_dir."""
    orch = Orchestrator(
        name, uploaded_files, on_stage=on_stage, proof=proof, cache_dir=cache_dir
    )
    return orch.run(export_dir=export_dir)
