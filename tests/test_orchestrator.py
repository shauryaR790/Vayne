"""Orchestrator and reporting tests."""

from pathlib import Path

from vayne.orchestrator.pipeline import Orchestrator
from vayne.reporting.generator import export_report

EXAMPLES = Path(__file__).parent.parent / "examples" / "scan_results"
OUT = Path(__file__).parent / "_output"


def test_full_pipeline():
    orch = Orchestrator("test-run", [EXAMPLES])
    report = orch.run()
    assert report.stats.findings_loaded > 0
    assert report.duration_seconds >= 0
    assert len(report.findings) >= 1


def test_export_reports(tmp_path=None):
    orch = Orchestrator("export-test", [EXAMPLES / "nuclei.json"])
    report = orch.run()
    out = OUT
    out.mkdir(exist_ok=True)
    paths = export_report(report, out)
    assert paths["json"].exists()
    assert paths["html"].exists()
    assert paths["markdown"].exists()
