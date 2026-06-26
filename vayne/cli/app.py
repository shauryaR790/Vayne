"""VAYNE Typer CLI application."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Optional

import typer

from vayne import __version__
from vayne.cli.display import (
    LiveInvestigationUI,
    LiveSession,
    console,
    print_banner,
    print_final_report,
    print_finding_analysis,
    print_stage,
)
from vayne.models.schemas import AnalyzedFinding
from vayne.pipeline.runner import InvestigationPipeline

app = typer.Typer(
    name="vayne",
    help="VAYNE — AI security analyst validation engine",
    add_completion=False,
    no_args_is_help=True,
)


@app.callback()
def main_callback() -> None:
    """VAYNE automates manual security finding validation."""


@app.command("validate")
def validate_cmd(
    paths: Annotated[
        list[Path],
        typer.Argument(help="Scan files or directory (e.g. scan_results/)"),
    ],
    name: Annotated[
        Optional[str],
        typer.Option("--name", "-n", help="Investigation name"),
    ] = None,
    quiet: Annotated[
        bool,
        typer.Option("--quiet", "-q", help="Minimal output"),
    ] = False,
) -> None:
    """Validate and correlate findings from scanner outputs."""
    print_banner()

    investigation_name = name
    if not investigation_name:
        investigation_name = typer.prompt("Enter investigation name", default="investigation-01")

    resolved = [p.resolve() for p in paths]
    for p in resolved:
        if not p.exists():
            raise typer.BadParameter(f"Path not found: {p}")

    if quiet:
        _run_quiet(investigation_name, resolved)
        return

    ui = LiveInvestigationUI()
    findings_buffer: list[AnalyzedFinding] = []

    def on_stage(stage: str, detail: str, progress: float) -> None:
        ui.on_stage(stage, detail, progress)
        ui.refresh()

    def on_finding(finding: AnalyzedFinding, index: int, total: int) -> None:
        ui.on_finding(finding, index, total)
        ui.refresh()
        findings_buffer.append(finding)

    pipeline = InvestigationPipeline(
        name=investigation_name,
        paths=resolved,
        on_stage=on_stage,
        on_finding=on_finding,
    )

    with LiveSession(ui):
        report = pipeline.run()
        ui.set_loaded(report.stats.loaded)
        ui.refresh()

    console.print()
    print_stage("Loading scan files", f"Loaded {report.stats.loaded} findings")
    print_stage("Normalizing findings", "Generated common schema")
    print_stage("Correlating findings", f"Correlated {len(report.findings)} findings")
    print_stage("Beginning validation", "Analysis complete")

    for finding in findings_buffer:
        print_finding_analysis(finding)

    print_final_report(report)


def _run_quiet(name: str, paths: list[Path]) -> None:
    pipeline = InvestigationPipeline(name=name, paths=paths)
    report = pipeline.run()
    s = report.stats
    console.print(f"Loaded: {s.loaded} | Validated: {s.validated} | FP: {s.false_positives}")


@app.command("version")
def version_cmd() -> None:
    """Show VAYNE version."""
    console.print(f"VAYNE v{__version__}")


def main() -> None:
    app()


if __name__ == "__main__":
    main()
