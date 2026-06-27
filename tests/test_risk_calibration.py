"""Phase F — risk calibration + parity + factor reconstruction."""

from __future__ import annotations

from functools import reduce
from pathlib import Path

from vayne.attack_paths.discovery import discover_attack_paths
from vayne.attack_paths.scoring import score_path
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

from tests._search_fixtures import linear_graph

METASPLOIT = Path(__file__).parent.parent / "examples" / "metasploit.xml"


def _meta_paths():
    findings, assets = load_scan_files([METASPLOIT])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths, _ = discover_attack_paths(findings, assets, correlated, validations)
    return paths


def test_metasploitable_risk_parity():
    paths = _meta_paths()
    assert sorted(p.risk_score for p in paths) == [6.5, 7.2, 8.6, 8.6]


def test_risk_proof_reconstructs_raw_score():
    """Product of all factor weights (excluding the explicit RCE floor factor)
    must equal the proof's raw_score — i.e. no hidden constants."""
    for p in _meta_paths():
        rp = p.risk_proof
        weights = [
            f["weight"] for f in rp["factors"] if f["name"] != "verified_rce_floor"
        ]
        product = round(reduce(lambda a, b: a * b, weights, 1.0), 4)
        assert abs(product - rp["raw_score"]) < 0.01, (product, rp["raw_score"])


def test_normalized_score_matches_risk_score():
    for p in _meta_paths():
        assert p.risk_proof["normalized_score"] == p.risk_score


def test_high_value_terminal_raises_risk_vs_plain():
    plain = linear_graph([("internet", "endpoint"), ("host", "endpoint")])
    db = linear_graph([("internet", "endpoint"), ("db", "database")])
    risk_plain, _, _, _ = score_path(plain, ["internet", "host"])
    risk_db, _, _, _ = score_path(db, ["internet", "db"])
    assert risk_db > risk_plain


def test_identity_terminal_raises_risk():
    plain = linear_graph([("internet", "endpoint"), ("host", "endpoint")])
    iam = linear_graph([("internet", "endpoint"), ("role", "iam_role")])
    risk_plain, _, _, _ = score_path(plain, ["internet", "host"])
    risk_iam, _, _, _ = score_path(iam, ["internet", "role"])
    assert risk_iam > risk_plain
