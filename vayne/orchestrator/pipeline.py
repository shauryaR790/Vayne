"""7-stage investigation orchestrator."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Callable

from vayne.analyst.engine import generate_brief
from vayne.attack_paths.graph import discover_attack_paths
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.exploitability.scorer import score_exploitability
from vayne.false_positive.classifier import build_stats
from vayne.models import Classification, InvestigatedFinding, InvestigationReport
from vayne.parsers.loader import load_scan_files
from vayne.remediation.engine import generate_timeline
from vayne.reporting.generator import export_report
from vayne.validator.engine import validate_finding

StageCallback = Callable[[int, str, str], None]
ThinkingCallback = Callable[[str], None]

STAGES = [
    "Loading scans",
    "Parsing findings",
    "Correlating assets",
    "Removing false positives",
    "Building attack graph",
    "Calculating exploitability",
    "Generating analyst report",
]


class Orchestrator:
    def __init__(
        self,
        name: str,
        paths: list[Path],
        on_stage: StageCallback | None = None,
        on_thinking: ThinkingCallback | None = None,
    ):
        self.name = name
        self.paths = paths
        self.on_stage = on_stage or (lambda *_: None)
        self.on_thinking = on_thinking or (lambda _: None)
        self.thinking_log: list[str] = []
        self._start = 0.0

    def _think(self, msg: str) -> None:
        line = f"[VAYNE] {msg}"
        self.thinking_log.append(line)
        self.on_thinking(line)

    def run(self, export_dir: Path | None = None) -> InvestigationReport:
        self._start = time.perf_counter()

        self.on_stage(1, STAGES[0], "Reading scanner outputs")
        self._think("Initializing investigation workspace...")
        raw_findings, raw_assets = load_scan_files(self.paths)
        self._think(f"Loaded {len(raw_findings)} raw findings from {len(self.paths)} path(s).")

        self.on_stage(2, STAGES[1], f"Normalized {len(raw_findings)} findings")
        self._think("Parsing and normalizing to common schema...")

        self.on_stage(3, STAGES[2], "Merging duplicate signals")
        correlated = correlate_findings(raw_findings)
        assets = correlate_assets(raw_assets)
        self._think(f"Correlated into {len(correlated)} unique investigation targets.")

        self.on_stage(4, STAGES[3], "Validating each finding")
        investigated: list[InvestigatedFinding] = []
        validations = []

        for item in correlated:
            self._think(f"Analyzing {item.title} on {item.host}...")
            validation = validate_finding(item, assets)
            validations.append(validation)

            if validation.classification == Classification.FALSE_POSITIVE:
                self._think(f"{item.title} — likely false positive (confidence {validation.confidence}%).")
            else:
                self._think(f"{item.title} — validation confidence increased to {validation.confidence}%.")

            attack_paths_preview = discover_attack_paths([item])
            brief = generate_brief(item, validation, attack_paths_preview)
            timeline = generate_timeline(item, validation)
            exp_score = score_exploitability(item, validation)

            investigated.append(
                InvestigatedFinding(
                    correlated=item,
                    validation=validation,
                    analyst=brief,
                    remediation=timeline,
                    exploitability_score=exp_score,
                )
            )
            time.sleep(0.08)

        self.on_stage(5, STAGES[4], "Discovering attack chains")
        attack_paths = discover_attack_paths(correlated)
        for p in attack_paths:
            self._think(f"Attack path discovered: {p.title}")
            self._think(f"Blast radius: {p.blast_radius}")

        self.on_stage(6, STAGES[5], "Scoring exploitability")
        self._think("Calculating exploitability and business impact...")

        self.on_stage(7, STAGES[6], "Building final report")
        stats = build_stats(len(raw_findings), correlated, validations, len(attack_paths))
        self._think(f"Estimated analyst time saved: {stats.analyst_hours_saved}h")

        duration = time.perf_counter() - self._start
        report = InvestigationReport(
            name=self.name,
            target=", ".join(str(p) for p in self.paths),
            duration_seconds=duration,
            stats=stats,
            assets=assets,
            findings=investigated,
            attack_paths=attack_paths,
            thinking_log=self.thinking_log,
        )

        if export_dir:
            export_report(report, export_dir)
            self._think(f"Reports exported to {export_dir}")

        return report
