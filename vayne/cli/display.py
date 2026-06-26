"""Rich terminal UI for VAYNE."""

from __future__ import annotations

from rich import box
from rich.align import Align
from rich.console import Console, Group
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn
from rich.rule import Rule
from rich.table import Table
from rich.text import Text

from vayne.models import Classification, InvestigationReport

console = Console()

BANNER = """
┌─────────────────────┐
│   VAYNE SECURITY AI │
│  Analyst Validation │
└─────────────────────┘
"""


class LiveUI:
    def __init__(self) -> None:
        self.stage_num = 0
        self.stage_label = "Initializing"
        self.stage_detail = ""
        self.thinking: list[str] = []
        self.stats = {
            "findings": 0,
            "paths": 0,
            "fps": 0,
            "hours": 0.0,
            "confidence": 0,
            "risk": 0.0,
        }
        self._progress = Progress(
            SpinnerColumn(),
            TextColumn("[bold]{task.description}"),
            BarColumn(bar_width=36, complete_style="white"),
            TextColumn("{task.percentage:>3.0f}%"),
            expand=True,
        )
        self._task = self._progress.add_task("VAYNE", total=7)

    def on_stage(self, num: int, label: str, detail: str) -> None:
        self.stage_num = num
        self.stage_label = label
        self.stage_detail = detail
        self._progress.update(self._task, completed=num)

    def on_thinking(self, line: str) -> None:
        self.thinking.append(line.replace("[VAYNE] ", ""))
        if len(self.thinking) > 12:
            self.thinking = self.thinking[-12:]

    def update_stats(self, report: InvestigationReport) -> None:
        s = report.stats
        self.stats = {
            "findings": s.findings_loaded,
            "paths": s.attack_paths,
            "fps": s.false_positives_removed,
            "hours": s.analyst_hours_saved,
            "confidence": s.confirmed * 90 // max(s.confirmed + s.manual_review, 1),
            "risk": max((f.exploitability_score for f in report.findings), default=0),
        }

    def render(self) -> Group:
        layout = Layout()
        layout.split_column(
            Layout(Panel(Align.center(Text(BANNER, style="bold white")), border_style="white"), size=6),
            Layout(self._progress, size=3),
            Layout(name="body"),
        )
        layout["body"].split_row(
            Layout(self._pipeline_panel(), ratio=2),
            Layout(Group(self._stats_panel(), self._thinking_panel()), ratio=3),
        )
        return Group(layout)

    def _pipeline_panel(self) -> Panel:
        t = Text()
        t.append(f"[{self.stage_num}/7] ", style="bold cyan")
        t.append(self.stage_label + "\n", style="bold white")
        t.append(self.stage_detail, style="dim")
        return Panel(t, title="Pipeline", border_style="dim white")

    def _stats_panel(self) -> Panel:
        table = Table.grid(padding=(0, 1))
        table.add_column(style="dim")
        table.add_column(style="bold")
        for k, v in [
            ("Findings discovered", self.stats["findings"]),
            ("Attack paths", self.stats["paths"]),
            ("False positives removed", self.stats["fps"]),
            ("Analyst time saved", f"{self.stats['hours']:.1f}h"),
            ("Risk score", f"{self.stats['risk']:.1f}"),
        ]:
            table.add_row(k + ":", str(v))
        return Panel(table, title="Live Stats", border_style="dim white")

    def _thinking_panel(self) -> Panel:
        body = "\n".join(f"• {l}" for l in self.thinking[-8:]) or "• Starting analysis..."
        return Panel(body, title="VAYNE THINKING", border_style="dim white")


def print_final_report(report: InvestigationReport) -> None:
    s = report.stats
    console.print()
    console.print(Rule("[bold white]INVESTIGATION COMPLETE[/bold white]"))
    console.print()

    summary = Table.grid(padding=(0, 2))
    for label, val in [
        ("Target", report.target),
        ("Duration", f"{report.duration_seconds:.0f}s"),
        ("Findings", str(s.findings_loaded)),
        ("Validated", str(s.confirmed)),
        ("False Positives", str(s.false_positives_removed)),
        ("Attack Paths", str(s.attack_paths)),
        ("Analyst Hours Saved", f"{s.analyst_hours_saved}h"),
    ]:
        summary.add_row(label + ":", val)
    console.print(Panel(summary, border_style="white", box=box.ROUNDED))

    priority = [
        f
        for f in report.findings
        if f.validation.classification != Classification.FALSE_POSITIVE
    ][:5]
    if not priority:
        priority = report.findings[:3]

    for f in priority:
        console.print(Rule(style="dim"))
        sev = f.correlated.severity.upper()
        console.print(f"[bold]{sev}[/bold] — {f.correlated.title}")
        console.print(f"Status: [bold]{f.validation.classification.value}[/bold]")
        console.print(f"Confidence: [bold]{f.validation.confidence}%[/bold]")
        console.print("[dim]Reasoning:[/dim]")
        for r in f.validation.reasoning:
            icon = "✓" if "not" not in r else "✗"
            console.print(f"  {icon} {r}")
        console.print(f"[dim]Root cause:[/dim] {f.analyst.root_cause}")
        console.print(f"[dim]Business impact:[/dim] {f.analyst.business_impact}")
        console.print(f"[dim]Remediation:[/dim] {f.analyst.remediation_summary}")

    if report.attack_paths:
        console.print(Rule("[bold]Attack Paths[/bold]", style="dim"))
        for p in report.attack_paths:
            chain = " → ".join(n.label for n in p.nodes)
            console.print(f"[bold]{p.title}[/bold]")
            console.print(f"  {chain}")
            console.print(
                f"  Risk {p.risk_score} | Confidence {p.confidence}% | {p.exploit_time}"
            )
