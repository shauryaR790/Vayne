"""Rich terminal display for VAYNE CLI."""

from __future__ import annotations

from rich import box
from rich.align import Align
from rich.console import Console, Group
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn, TimeRemainingColumn
from rich.rule import Rule
from rich.table import Table
from rich.text import Text

from vayne.models.schemas import AnalyzedFinding, Classification, InvestigationReport

console = Console()


def print_banner() -> None:
    banner = """
╭──────────────────────────────────────────────╮
│                 VAYNE AI                     │
│     Security Analyst Validation Engine       │
╰──────────────────────────────────────────────╯
"""
    console.print(banner, style="bold white")


def print_stage(message: str, detail: str = "", success: bool = True) -> None:
    icon = "✓" if success else "●"
    style = "green" if success else "cyan"
    line = f"[{style}]{icon}[/{style}] {message}"
    if detail:
        line += f" [dim]— {detail}[/dim]"
    console.print(line)


class LiveInvestigationUI:
    """Live stats + thinking panel during pipeline execution."""

    def __init__(self) -> None:
        self.stage = "Initializing"
        self.detail = ""
        self.progress = 0.0
        self.current_finding = ""
        self.stats = {
            "loaded": 0,
            "validated": 0,
            "false_positives": 0,
            "manual_review": 0,
            "critical": 0,
            "hours_saved": 0.0,
        }
        self.thinking_lines: list[str] = [
            "• Waiting for scan inputs...",
        ]
        self._progress = Progress(
            SpinnerColumn(),
            TextColumn("[bold cyan]{task.description}"),
            BarColumn(bar_width=40, complete_style="white", finished_style="green"),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            TimeRemainingColumn(),
            expand=True,
        )
        self._task = self._progress.add_task("VAYNE", total=100)

    def _thinking_panel(self) -> Panel:
        body = "\n".join(self.thinking_lines[-8:])
        return Panel(
            body,
            title="[bold]VAYNE THINKING[/bold]",
            border_style="dim white",
            padding=(1, 2),
        )

    def _stats_panel(self) -> Panel:
        table = Table.grid(padding=(0, 2))
        table.add_column(style="dim")
        table.add_column(style="bold white")
        rows = [
            ("Findings Loaded", str(self.stats["loaded"])),
            ("Validated", str(self.stats["validated"])),
            ("False Positives", str(self.stats["false_positives"])),
            ("Manual Review", str(self.stats["manual_review"])),
            ("Critical Findings", str(self.stats["critical"])),
            ("Analyst Hours Saved", f"{self.stats['hours_saved']:.1f}h"),
        ]
        for label, val in rows:
            table.add_row(label + ":", val)
        return Panel(table, title="[bold]LIVE STATS[/bold]", border_style="dim white")

    def _stage_panel(self) -> Panel:
        text = Text()
        text.append("Current Stage:\n", style="dim")
        text.append(self.stage + "\n\n", style="bold white")
        text.append("Current Finding:\n", style="dim")
        text.append(self.current_finding or "—", style="bold cyan")
        return Panel(text, title="[bold]PIPELINE[/bold]", border_style="dim white")

    def render(self) -> Group:
        self._progress.update(self._task, completed=int(self.progress * 100), description=self.stage)
        layout = Layout()
        layout.split_column(
            Layout(self._progress, size=3),
            Layout(name="body"),
        )
        layout["body"].split_row(
            Layout(self._stage_panel(), ratio=2),
            Layout(
                Group(self._stats_panel(), self._thinking_panel()),
                ratio=3,
            ),
        )
        return Group(layout)

    def on_stage(self, stage: str, detail: str, progress: float) -> None:
        self.stage = stage
        self.detail = detail
        self.progress = progress
        self.thinking_lines.append(f"• {stage}...")
        if "load" in stage.lower():
            self.thinking_lines.append("• Parsing scanner outputs...")
        if "normal" in stage.lower():
            self.thinking_lines.append("• Building common schema...")
        if "correlat" in stage.lower():
            self.thinking_lines.append("• Merging signals across tools...")
        if "validat" in stage.lower():
            self.thinking_lines.extend(
                [
                    "• Checking host availability...",
                    "• Verifying service fingerprint...",
                    "• Looking for exploit prerequisites...",
                    "• Attempting safe validation...",
                ]
            )

    def on_finding(self, finding: AnalyzedFinding, index: int, total: int) -> None:
        self.current_finding = finding.correlated.finding

        if finding.classification == Classification.CONFIRMED:
            self.stats["validated"] += 1
        if finding.classification == Classification.PROBABLE_FALSE_POSITIVE:
            self.stats["false_positives"] += 1
        if finding.classification == Classification.MANUAL_REVIEW:
            self.stats["manual_review"] += 1
        if finding.correlated.severity.lower() in ("critical", "high"):
            if finding.classification != Classification.PROBABLE_FALSE_POSITIVE:
                self.stats["critical"] += 1

        self.stats["hours_saved"] = round(index * 0.35, 1)

    def set_loaded(self, count: int) -> None:
        self.stats["loaded"] = count


def print_finding_analysis(finding: AnalyzedFinding) -> None:
    c = finding.correlated
    v = finding.validation
    console.print()
    console.print(Rule(f"[bold]VAYNE[/bold] — Analyzing {c.finding}...", style="dim white"))

    for reason in v.reasoning:
        ok = not any(x in reason for x in ("failed", "not met", "required"))
        icon = "✓" if ok else "✗"
        style = "green" if ok else "red"
        console.print(f"  [{style}]{icon}[/{style}] {reason}")

    console.print()
    console.print(f"  [dim]Confidence:[/dim] [bold]{v.confidence}%[/bold]")
    console.print(f"  [dim]Conclusion:[/dim] [bold]{finding.status_label}[/bold]")
    console.print(Rule(style="dim"))


def print_final_report(report: InvestigationReport) -> None:
    s = report.stats
    console.print()
    console.print("═" * 54, style="bold white")
    console.print(Align.center("[bold white]INVESTIGATION COMPLETE[/bold white]"))
    console.print("═" * 54, style="bold white")
    console.print()

    summary = Table.grid(padding=(0, 2))
    summary.add_column(style="dim")
    summary.add_column(style="bold")
    for label, val in [
        ("Target", report.target),
        ("Duration", f"{report.duration_seconds:.0f}s"),
        ("Findings", str(s.loaded)),
        ("Validated", str(s.validated)),
        ("Likely Exploitable", str(s.likely_exploitable)),
        ("False Positives", str(s.false_positives)),
        ("Manual Review", str(s.manual_review)),
        ("Analyst Time Saved", f"{s.analyst_hours_saved}h"),
    ]:
        summary.add_row(label + ":", val)
    console.print(Panel(summary, border_style="white", box=box.ROUNDED))
    console.print()

    priority = [
        f for f in report.findings
        if f.classification != Classification.PROBABLE_FALSE_POSITIVE
    ][:6]
    if not priority:
        priority = report.findings[:3]

    for finding in priority:
        _print_finding_card(finding)

    if len(report.findings) > len(priority):
        console.print(
            f"[dim]… and {len(report.findings) - len(priority)} more findings in report[/dim]"
        )


def _print_finding_card(finding: AnalyzedFinding) -> None:
    c = finding.correlated
    sev = c.severity.upper()
    console.print("═" * 54, style="dim white")
    color = _sev_color(c.severity)
    console.print(f"[bold {color}]{sev}[/bold {color}]")
    console.print(f"[bold white]{c.finding}[/bold white]")
    console.print()
    console.print(f"[dim]Status:[/dim] [bold]{finding.status_label}[/bold]")
    console.print(f"[dim]Confidence:[/dim] [bold]{finding.validation.confidence}%[/bold]")
    console.print(f"[dim]Host:[/dim] {c.host}" + (f":{c.port}" if c.port else ""))
    console.print()

    console.print("[dim]Reasoning:[/dim]")
    for r in finding.validation.reasoning:
        ok = not any(x in r for x in ("failed", "not met"))
        icon = "✓" if ok else "✗"
        console.print(f"  {icon} {r}")

    console.print()
    if finding.analyst.why_it_matters:
        console.print(f"[dim]Business Impact:[/dim] {finding.analyst.business_impact}")
        console.print(f"[dim]Why it matters:[/dim] {finding.analyst.why_it_matters}")

    if finding.analyst.remediation_steps:
        console.print("[dim]Recommended Action:[/dim]")
        for step in finding.analyst.remediation_steps[:2]:
            console.print(f"  → {step}")
    console.print()


def _sev_color(severity: str) -> str:
    return {
        "critical": "red",
        "high": "yellow",
        "medium": "cyan",
        "low": "green",
    }.get(severity.lower(), "white")


class LiveSession:
    """Context manager wrapping Rich Live display."""

    def __init__(self, ui: LiveInvestigationUI) -> None:
        self.ui = ui
        self._live: Live | None = None

    def __enter__(self) -> LiveInvestigationUI:
        self._live = Live(self.ui.render(), console=console, refresh_per_second=8)
        self._live.__enter__()
        return self.ui

    def __exit__(self, *args: object) -> None:
        if self._live:
            self._live.__exit__(*args)

    def refresh(self) -> None:
        if self._live:
            self._live.update(self.ui.render())
