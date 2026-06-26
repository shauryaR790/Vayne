"""Correlator tests."""

from pathlib import Path

from vayne.correlator.engine import correlate_findings
from vayne.parsers.loader import load_scan_files

EXAMPLES = Path(__file__).parent.parent / "examples" / "scan_results"


def test_correlate_reduces_duplicates():
    findings, _ = load_scan_files([EXAMPLES])
    correlated = correlate_findings(findings)
    assert len(correlated) < len(findings)


def test_correlate_multi_source():
    findings, _ = load_scan_files([EXAMPLES])
    correlated = correlate_findings(findings)
    multi = [c for c in correlated if len(c.sources) >= 2]
    assert len(multi) >= 1
