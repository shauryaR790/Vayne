"""Phase E — every edge and path emits a complete ConfidenceProof."""

from __future__ import annotations

from pathlib import Path

from vayne.attack_paths.confidence_proof import ConfidenceFactor, ConfidenceProof
from vayne.attack_paths.discovery import discover_attack_paths
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

METASPLOIT = Path(__file__).parent.parent / "examples" / "metasploit.xml"

_PROOF_KEYS = {"formula", "factors", "raw_score", "normalized_score", "explanation"}


def _paths():
    findings, assets = load_scan_files([METASPLOIT])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths, _ = discover_attack_paths(findings, assets, correlated, validations)
    return paths


def test_proof_object_shape():
    proof = ConfidenceProof(formula="x")
    proof.add("f", 0.9, 90.0, evidence=["e"])
    proof.finalize(raw_score=90.0, normalized_score=90)
    d = proof.to_dict()
    assert _PROOF_KEYS <= set(d)
    assert isinstance(proof.factors[0], ConfidenceFactor)
    assert d["factors"][0]["name"] == "f"
    assert proof.proof_summary()["final"] == 90


def test_every_path_emits_confidence_proof():
    paths = _paths()
    assert paths
    for p in paths:
        proof = p.confidence_proof
        assert proof, "path missing confidence_proof"
        assert _PROOF_KEYS <= set(proof)
        assert proof["normalized_score"] == p.confidence
        assert proof["factors"], "path proof has no factors"
        for f in proof["factors"]:
            assert f["name"]
            assert "weight" in f
            assert "contribution" in f


def test_every_edge_emits_confidence_proof():
    paths = _paths()
    for p in paths:
        for e in p.edges:
            proof = e.confidence_proof
            assert proof, f"edge {e.source_id}->{e.target_id} missing proof"
            assert _PROOF_KEYS <= set(proof)
            assert proof["normalized_score"] == e.confidence_contribution


def test_no_factor_without_evidence_or_name():
    """No hidden contribution: every path factor is named (the contract)."""
    paths = _paths()
    for p in paths:
        for f in p.confidence_proof["factors"]:
            assert f["name"], "unnamed (hidden) confidence factor"


def test_verified_exploit_edge_proof_names_floor_and_cap():
    """The former hidden max()/min() are now named, documented factors."""
    paths = _paths()
    vsftpd = next(p for p in paths if any("CVE-2011-2523" in n.label for n in p.nodes))
    verified_edges = [
        e for e in vsftpd.edges
        if e.confidence_proof.get("formula", "").startswith("verified_exploit_confidence")
    ]
    assert verified_edges
    names = {f["name"] for f in verified_edges[0].confidence_proof["factors"]}
    assert {"base_multiplicative_model", "maturity_floor", "credibility_boost", "maturity_cap"} <= names
