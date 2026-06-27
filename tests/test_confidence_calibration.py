"""Confidence and risk calibration regression tests — Metasploitable2."""

from pathlib import Path

from vayne.attack_paths.discovery import discover_attack_paths
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.models import Classification
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

EXAMPLES = Path(__file__).parent.parent / "examples"
METASPLOIT = EXAMPLES / "metasploit.xml"
FIRSTRUN = EXAMPLES / "scan_results" / "firstrun.xml"


def _discover(scan_path: Path):
    findings, assets = load_scan_files([scan_path])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths, proof = discover_attack_paths(findings, assets, correlated, validations)
    return paths, proof, correlated, validations


def test_metasploitable_produces_at_least_four_paths():
    paths, _, _, _ = _discover(METASPLOIT)
    assert len(paths) >= 4


def test_vsftpd_path_confidence_at_least_90():
    paths, _, _, _ = _discover(METASPLOIT)
    vsftpd = [
        p for p in paths
        if any("CVE-2011-2523" in n.label for n in p.nodes)
    ]
    assert len(vsftpd) >= 1
    assert vsftpd[0].confidence >= 90, f"vsftpd confidence {vsftpd[0].confidence}%"
    assert vsftpd[0].risk_score >= 8.0, f"vsftpd risk {vsftpd[0].risk_score}"


def test_samba_path_confidence_at_least_85():
    paths, _, _, _ = _discover(METASPLOIT)
    samba = [
        p for p in paths
        if any("CVE-2007-2447" in n.label for n in p.nodes)
    ]
    assert len(samba) >= 1
    assert samba[0].confidence >= 85, f"samba confidence {samba[0].confidence}%"


def test_at_least_one_path_risk_at_least_8():
    paths, _, _, _ = _discover(METASPLOIT)
    assert any(p.risk_score >= 8.0 for p in paths)


def test_weaponized_paths_have_analyst_explanations():
    paths, _, _, _ = _discover(METASPLOIT)
    vsftpd = next(p for p in paths if any("CVE-2011-2523" in n.label for n in p.nodes))
    assert len(vsftpd.path_explanation) >= 3
    assert len(vsftpd.confidence_explanation) >= 2
    assert "remote code execution" in vsftpd.expected_impact.lower() or "shell" in vsftpd.expected_impact.lower()


def test_firstrun_inventory_no_attack_paths():
    paths, proof, _, _ = _discover(FIRSTRUN)
    assert len(paths) == 0
    pd = proof.path_discovery
    assert pd is not None
    assert pd.paths_rejected >= 1


def test_firstrun_observed_fingerprints_high_observation_confidence():
    _, _, correlated, validations = _discover(FIRSTRUN)
    apache = next(c for c in correlated if "apache" in c.title.lower())
    result = validations[apache.id]
    assert result.classification == Classification.OBSERVED
    assert result.confidence >= 70
    assert result.confidence <= 85


def test_false_positives_still_rejected():
    _, _, correlated, validations = _discover(METASPLOIT)
    fps = [
        v for v in validations.values()
        if v.classification == Classification.FALSE_POSITIVE
    ]
    assert len(fps) >= 1


# --------------------------------------------------------------------------- #
# Phase E — calibration bands (Step 6). Parity wins: bands are guidance, and
# the Metasploitable verified-weaponized exploits legitimately reach 100.       #
# --------------------------------------------------------------------------- #

def _cve_path(paths, cve):
    return next(p for p in paths if any(cve in n.label for n in p.nodes))


def test_verified_weaponized_band():
    paths, _, _, _ = _discover(METASPLOIT)
    for cve in ("CVE-2011-2523", "CVE-2007-2447"):  # vsftpd, samba — weaponized
        p = _cve_path(paths, cve)
        assert 85 <= p.confidence <= 100, f"{cve} confidence {p.confidence}"


def test_verified_exploit_band():
    paths, _, _, _ = _discover(METASPLOIT)
    for cve in ("CVE-2009-3548", "CVE-2010-4221"):  # tomcat (functional), proftpd (poc)
        p = _cve_path(paths, cve)
        assert 70 <= p.confidence <= 95, f"{cve} confidence {p.confidence}"


def test_no_accepted_path_below_threshold():
    paths, _, _, _ = _discover(METASPLOIT)
    assert paths
    assert all(p.confidence >= 50 for p in paths)


def test_dead_confidence_constant_removed():
    import vayne.attack_paths.path_reasoning as pr
    assert not hasattr(pr, "MAX_CONFIDENCE_ALL_TIER1")
