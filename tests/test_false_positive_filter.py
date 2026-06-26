"""Tests for false positive filtering and stats consistency."""

from pathlib import Path

from vayne.correlator.engine import correlate_findings
from vayne.false_positive.classifier import build_stats
from vayne.models import Classification
from vayne.orchestrator.pipeline import Orchestrator
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

EXAMPLES = Path(__file__).parent.parent / "examples" / "scan_results"
FP_NOISE = Path(__file__).parent / "fixtures" / "fp_noise.json"


def test_false_positives_discarded_from_stats():
    findings, assets = load_scan_files([FP_NOISE])
    correlated = correlate_findings(findings)
    validations = [validate_finding(c, assets) for c in correlated]
    fp = sum(1 for v in validations if v.classification == Classification.FALSE_POSITIVE)
    assert fp >= 8, f"Expected most noise findings discarded, got {fp}/{len(correlated)}"
    stats = build_stats(len(findings), correlated, validations, 0)
    assert stats.false_positives_removed == fp
    assert stats.findings_retained == len(correlated) - fp


def test_zero_validated_means_zero_attack_paths():
    report = Orchestrator("fp-test", [FP_NOISE], proof=True).run()
    assert report.stats.validated == 0
    assert report.stats.attack_paths == 0


def test_mixed_real_and_fake_findings():
    report = Orchestrator(
        "mixed-test",
        [EXAMPLES, FP_NOISE],
        proof=True,
    ).run()
    assert report.stats.findings_loaded > 10
    assert report.stats.false_positives_removed >= 8
    assert report.stats.findings_retained == (
        report.stats.findings_correlated - report.stats.false_positives_removed
    )
    if report.stats.validated == 0:
        assert report.stats.attack_paths == 0
    else:
        assert report.stats.attack_paths <= report.stats.validated * 3


def test_attack_paths_require_validated_findings():
    report = Orchestrator("full-scan", [EXAMPLES], proof=True).run()
    if report.stats.validated == 0:
        assert len(report.attack_paths) == 0
    else:
        for path in report.attack_paths:
            for edge in path.edges:
                assert edge.discovered_from
                assert edge.source_finding_id
