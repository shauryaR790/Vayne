"""VAYNE CLI — Typer entrypoint."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Optional

import typer

from vayne import __version__
from vayne.cli.display import LiveUI, console, print_final_report
from vayne.orchestrator.pipeline import Orchestrator
from rich.live import Live

app = typer.Typer(
    name="vayne",
    help="VAYNE — AI Security Analyst validation engine",
    no_args_is_help=True,
)


@app.callback()
def _callback() -> None:
    """Automate post-scan finding validation like a human analyst."""


@app.command("analyze")
def analyze(
    paths: Annotated[
        list[Path],
        typer.Argument(help="Scan files or directory, e.g. ./scan_results/"),
    ],
    name: Annotated[
        Optional[str], typer.Option("--name", "-n", help="Investigation name")
    ] = None,
    output: Annotated[
        Optional[Path], typer.Option("--output", "-o", help="Export report directory")
    ] = None,
    quiet: Annotated[bool, typer.Option("--quiet", "-q")] = False,
    proof: Annotated[
        bool,
        typer.Option(
            "--proof",
            help="Print auditable graph: every node, edge, path algorithm, confidence breakdown",
        ),
    ] = False,
) -> None:
    """Analyze and validate security scan outputs."""
    resolved = [p.resolve() for p in paths]
    for p in resolved:
        if not p.exists():
            raise typer.BadParameter(f"Not found: {p}")

    inv_name = name or typer.prompt("Enter investigation name", default="investigation-01")
    export_dir = output or Path("reports") / inv_name.replace(" ", "_").lower()

    if quiet:
        report = Orchestrator(inv_name, resolved, proof=proof).run(export_dir=export_dir)
        console.print(f"Done — {report.stats.findings_loaded} findings analyzed")
        if proof and report.proof_log:
            for line in report.proof_log:
                console.print(line)
        return

    ui = LiveUI()
    orch = Orchestrator(
        inv_name,
        resolved,
        on_stage=ui.on_stage,
        on_thinking=ui.on_thinking,
        proof=proof,
    )

    with Live(ui.render(), console=console, refresh_per_second=10):
        report = orch.run(export_dir=export_dir)
        ui.update_stats(report)

    console.print()
    print_final_report(report)
    console.print(f"\n[dim]Reports exported to {export_dir.resolve()}[/dim]")


@app.command("version")
def version() -> None:
    console.print(f"VAYNE v{__version__}")


def main() -> None:
    app()


if __name__ == "__main__":
    main()
