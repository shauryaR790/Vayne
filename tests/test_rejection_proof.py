"""Phase G — rejected paths emit explainable RejectedPathProof."""

from __future__ import annotations

from pathlib import Path

from vayne.attack_paths.discovery import discover_attack_paths
from vayne.attack_paths.proof import RejectedPathProof, build_rejected_proof
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

METASPLOIT = Path(__file__).parent.parent / "examples" / "metasploit.xml"


def test_rejected_proof_shape_and_revival():
    rp = build_rejected_proof(
        path=["internet", "exec", "rds"],
        label="internet -> exec -> rds",
        reject_reason="execution -> data_access impossible",
        missing_evidence=["missing credential", "database auth evidence"],
        confidence_if_revived=84,
    )
    assert isinstance(rp, RejectedPathProof)
    d = rp.to_dict()
    assert d["reject_reason"]
    assert d["missing_evidence"]
    assert d["revive_with"], "must propose revival routes"
    assert d["tools_that_can_provide_evidence"], "must list tools"
    assert d["confidence_if_revived"] == 84


def test_rejected_proof_keys_complete():
    rp = build_rejected_proof(
        path=["a", "b"],
        label="a -> b",
        reject_reason="r",
        missing_evidence=["missing credential"],
    )
    keys = set(rp.to_dict().keys())
    assert {
        "path",
        "label",
        "reject_reason",
        "missing_evidence",
        "revive_with",
        "confidence_if_revived",
        "tools_that_can_provide_evidence",
    } <= keys


def test_discovery_rejected_path_proofs_are_complete():
    """Whenever discovery rejects paths, each rejection must carry a structured
    proof with missing evidence and revival options."""
    findings, assets = load_scan_files([METASPLOIT])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    _, proof = discover_attack_paths(findings, assets, correlated, validations)
    rejected_proofs = proof.path_discovery.rejected_path_proofs
    # Metasploitable may reject zero paths; when it rejects any, they must be
    # fully explainable.
    assert proof.path_discovery.paths_rejected == len(rejected_proofs)
    for rp in rejected_proofs:
        assert rp["reject_reason"]
        assert "missing_evidence" in rp
        assert "revive_with" in rp
