"""Phase F — RiskProof emission and structure."""

from __future__ import annotations

from pathlib import Path

from vayne.attack_paths.discovery import discover_attack_paths
from vayne.attack_paths.risk_proof import RiskFactor, RiskProof
from vayne.attack_paths.scoring import score_path
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

from tests._search_fixtures import linear_graph

METASPLOIT = Path(__file__).parent.parent / "examples" / "metasploit.xml"

_EXPECTED_FACTORS = {
    "cvss_base",
    "exploit_maturity",
    "access_vector",
    "authentication",
    "evidence_strength",
    "blast_radius",
    "privilege_gain",
    "business_criticality",
    "data_sensitivity",
    "identity_impact",
    "lateral_movement",
    "persistence",
}


def _meta_paths():
    findings, assets = load_scan_files([METASPLOIT])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths, _ = discover_attack_paths(findings, assets, correlated, validations)
    return paths


def test_risk_proof_dataclass_shape():
    proof = RiskProof(formula="x")
    proof.add("f", 2.0, 2.0, ["ev"])
    proof.finalize(2.0, 2.0)
    d = proof.to_dict()
    assert d["formula"] == "x"
    assert d["factors"][0]["name"] == "f"
    assert d["factors"][0]["evidence"] == ["ev"]
    assert isinstance(RiskFactor("a", 1.0, [], 1.0).weight, float)


def test_score_path_emits_risk_proof():
    g = linear_graph([("internet", "endpoint"), ("db", "database")])
    risk, detail, contribs, risk_proof = score_path(g, ["internet", "db"])
    assert isinstance(risk_proof, dict)
    assert risk_proof["formula"]
    names = {f["name"] for f in risk_proof["factors"]}
    assert _EXPECTED_FACTORS.issubset(names)


def test_every_accepted_path_has_full_risk_proof():
    for p in _meta_paths():
        rp = p.risk_proof
        assert rp, "accepted path missing risk_proof"
        names = {f["name"] for f in rp["factors"]}
        assert _EXPECTED_FACTORS.issubset(names)
        assert rp["normalized_score"] == p.risk_score
        for f in rp["factors"]:
            assert f["evidence"], f"factor {f['name']} has no evidence"


def test_new_dimensions_neutral_on_metasploitable():
    """Metasploitable has no high-value asset/identity/lateral/persistence, so
    every Phase F factor must be exactly 1.0 (keeps risk parity)."""
    for p in _meta_paths():
        by_name = {f["name"]: f["weight"] for f in p.risk_proof["factors"]}
        for dim in ("business_criticality", "data_sensitivity", "identity_impact",
                    "lateral_movement", "persistence"):
            assert by_name[dim] == 1.0


def test_business_and_data_factors_fire_on_high_value_terminal():
    plain = linear_graph([("internet", "endpoint"), ("host", "endpoint")])
    crit = linear_graph([("internet", "endpoint"), ("db", "database")])
    _, _, _, plain_proof = score_path(plain, ["internet", "host"])
    _, _, _, crit_proof = score_path(crit, ["internet", "db"])
    pf = {f["name"]: f["weight"] for f in plain_proof["factors"]}
    cf = {f["name"]: f["weight"] for f in crit_proof["factors"]}
    assert pf["business_criticality"] == 1.0
    assert cf["business_criticality"] > 1.0
    assert cf["data_sensitivity"] > 1.0
