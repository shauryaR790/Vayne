"""Tests for VAYNE parsers and pipeline."""

from pathlib import Path

import pytest

from vayne.parsers.base import load_findings, parse_file
from vayne.pipeline.runner import InvestigationPipeline

EXAMPLES = Path(__file__).parent.parent / "examples" / "scan_results"


def test_parse_nuclei():
    findings = parse_file(EXAMPLES / "nuclei.json")
    assert len(findings) >= 2
    assert findings[0].tool == "nuclei"


def test_parse_nmap():
    findings = parse_file(EXAMPLES / "nmap.xml")
    assert any(f.tool == "nmap" for f in findings)
    assert any("Apache" in f.version or "apache" in f.service for f in findings)


def test_load_directory():
    findings = load_findings([EXAMPLES])
    assert len(findings) >= 5


def test_pipeline_runs():
    pipeline = InvestigationPipeline(name="test", paths=[EXAMPLES])
    report = pipeline.run()
    assert report.stats.loaded > 0
    assert report.duration_seconds >= 0
    assert isinstance(report.findings, list)
