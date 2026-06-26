"""Validator tests."""

from pathlib import Path

from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

EXAMPLES = Path(__file__).parent.parent / "examples" / "scan_results"


def test_validate_apache():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    apache = next(c for c in correlated if "apache" in c.title.lower())
    result = validate_finding(apache, assets)
    assert result.host_alive
    assert result.confidence > 50


def test_validate_has_reasoning():
    findings, assets = load_scan_files([EXAMPLES / "nuclei.json"])
    correlated = correlate_findings(findings)
    result = validate_finding(correlated[0], assets)
    assert len(result.reasoning) >= 2
