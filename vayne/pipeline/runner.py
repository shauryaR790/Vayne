"""Investigation pipeline orchestrator."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Callable

from vayne.analyst.ai_analyst import analyze
from vayne.correlation.engine import correlate
from vayne.false_positive.detector import classify, status_label
from vayne.models.schemas import (
    AnalyzedFinding,
    Classification,
    InvestigationReport,
    InvestigationStats,
    RawFinding,
)
from vayne.parsers.base import load_findings
from vayne.scoring.exploitability import score
from vayne.validation.engine import validate

ProgressCallback = Callable[[str, str, float], None]
FindingCallback = Callable[[AnalyzedFinding, int, int], None]


class InvestigationPipeline:
    def __init__(
        self,
        name: str,
        paths: list[Path],
        on_stage: ProgressCallback | None = None,
        on_finding: FindingCallback | None = None,
    ):
        self.name = name
        self.paths = paths
        self.on_stage = on_stage or (lambda *_: None)
        self.on_finding = on_finding or (lambda *_: None)
        self._started = time.perf_counter()

    def run(self) -> InvestigationReport:
        target = ", ".join(str(p) for p in self.paths)

        self.on_stage("Loading scan files", "Parsing scanner outputs", 0.05)
        raw = load_findings(self.paths)

        self.on_stage("Normalizing findings", "Generated common schema", 0.15)

        self.on_stage("Correlating findings", f"Correlated {len(raw)} raw signals", 0.25)
        correlated = correlate(raw)

        self.on_stage("Beginning validation", "Analyzing each finding", 0.35)
        analyzed: list[AnalyzedFinding] = []
        total = max(len(correlated), 1)

        for i, item in enumerate(correlated):
            progress = 0.35 + (0.55 * (i + 1) / total)
            self.on_stage("Validating findings", item.finding, progress)

            validation = validate(item)
            classification = classify(item, validation)
            exploit_score = score(item, validation, classification)
            analyst = analyze(item, validation, classification, exploit_score)

            result = AnalyzedFinding(
                correlated=item,
                validation=validation,
                classification=classification,
                score=exploit_score,
                analyst=analyst,
                status_label=status_label(classification, validation),
            )
            analyzed.append(result)
            self.on_finding(result, i + 1, total)
            time.sleep(0.12)

        self.on_stage("Generating report", "Finalizing investigation", 0.98)
        stats = _build_stats(raw, analyzed)
        duration = time.perf_counter() - self._started

        self.on_stage("Complete", "Investigation finished", 1.0)
        return InvestigationReport(
            name=self.name,
            target=target,
            duration_seconds=duration,
            stats=stats,
            findings=analyzed,
        )


def _build_stats(raw: list[RawFinding], analyzed: list[AnalyzedFinding]) -> InvestigationStats:
    validated = sum(1 for a in analyzed if a.classification == Classification.CONFIRMED)
    likely = sum(1 for a in analyzed if a.classification == Classification.LIKELY_EXPLOITABLE)
    fps = sum(1 for a in analyzed if a.classification == Classification.PROBABLE_FALSE_POSITIVE)
    manual = sum(1 for a in analyzed if a.classification == Classification.MANUAL_REVIEW)
    critical = sum(
        1
        for a in analyzed
        if a.correlated.severity.lower() in ("critical", "high")
        and a.classification != Classification.PROBABLE_FALSE_POSITIVE
    )

    hours_saved = round(len(raw) * 2.3 / 60, 1)

    return InvestigationStats(
        loaded=len(raw),
        validated=validated,
        likely_exploitable=likely,
        false_positives=fps,
        manual_review=manual,
        critical=critical,
        analyst_hours_saved=hours_saved,
    )
