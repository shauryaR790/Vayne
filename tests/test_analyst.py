"""Analyst and remediation tests."""

from pathlib import Path

from vayne.analyst.engine import generate_brief
from vayne.attack_paths.discovery import discover_attack_paths
from vayne.correlator.engine import correlate_findings
from vayne.parsers.loader import load_scan_files
from vayne.remediation.engine import generate_timeline
from vayne.validator.engine import validate_finding

EXAMPLES = Path(__file__).parent.parent / "examples" / "scan_results"


def test_analyst_brief():
    findings, assets = load_scan_files([EXAMPLES])
    c = correlate_findings(findings)[0]
    v = validate_finding(c, assets)
    paths, _ = discover_attack_paths(findings, assets, [c], {c.id: v})
    brief = generate_brief(c, v, paths)
    assert brief.root_cause
    assert brief.why_this_matters


def test_remediation_timeline():
    findings, assets = load_scan_files([EXAMPLES])
    c = correlate_findings(findings)[0]
    v = validate_finding(c, assets)
    timeline = generate_timeline(c, v)
    assert len(timeline.immediate) >= 1
    assert len(timeline.long_term) >= 1
