"""Phase G — alternative-path proof structure and integration."""

from __future__ import annotations

from pathlib import Path

from vayne.attack_paths.discovery import discover_attack_paths
from vayne.attack_paths.proof import AlternativePath
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

METASPLOIT = Path(__file__).parent.parent / "examples" / "metasploit.xml"


def test_alternative_path_dataclass_shape():
    alt = AlternativePath(
        path=["internet", "cve", "domain_admin"],
        rejected_reason="missing privilege escalation",
        confidence=61,
    )
    d = alt.to_dict()
    assert d["path"] == ["internet", "cve", "domain_admin"]
    assert d["rejected_reason"] == "missing privilege escalation"
    assert d["confidence"] == 61


def test_accepted_paths_expose_alternatives_and_revival_fields():
    findings, assets = load_scan_files([METASPLOIT])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths, _ = discover_attack_paths(findings, assets, correlated, validations)
    assert paths
    for p in paths:
        assert isinstance(p.alternatives, list)
        assert isinstance(p.revival_options, list)
        # alternatives_rejected mirrors p.alternatives inside the accepted proof
        assert p.accepted_proof["alternatives_rejected"] == p.alternatives


def test_alternatives_sorted_by_confidence_desc():
    """If alternatives exist, they are ordered by would-be confidence (desc)."""
    findings, assets = load_scan_files([METASPLOIT])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths, _ = discover_attack_paths(findings, assets, correlated, validations)
    for p in paths:
        confs = [a["confidence"] for a in p.alternatives]
        assert confs == sorted(confs, reverse=True)
