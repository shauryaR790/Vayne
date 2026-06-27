"""Validator tests."""

from pathlib import Path

from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.models import Classification
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

EXAMPLES = Path(__file__).parent.parent / "examples" / "scan_results"


def test_validate_apache():
    findings, assets = load_scan_files([EXAMPLES])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    apache = next(
        c for c in correlated
        if "path traversal" in c.title.lower() or "41773" in " ".join(c.evidence)
    )
    result = validate_finding(apache, assets)
    assert result.host_alive
    assert result.confidence > 50


def test_nmap_service_fingerprint_is_observed_not_false_positive():
    findings, assets = load_scan_files([EXAMPLES / "firstrun.xml"])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    apache = next(c for c in correlated if "apache" in c.title.lower())
    result = validate_finding(apache, assets)
    assert result.classification == Classification.OBSERVED
    assert result.observation_status == "confirmed"
    assert result.exploitability_status == "not_applicable"
    assert "observation confirmed" in " ".join(result.reasoning).lower()


def test_validate_has_reasoning():
    findings, assets = load_scan_files([EXAMPLES / "nuclei.json"])
    correlated = correlate_findings(findings)
    result = validate_finding(correlated[0], assets)
    assert len(result.reasoning) >= 2
