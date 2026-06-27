"""Phase G — every accepted path emits a complete AcceptedPathProof."""

from __future__ import annotations

from pathlib import Path

from vayne.attack_paths.discovery import discover_attack_paths
from vayne.attack_paths.proof import AcceptedPathProof, build_accepted_proof
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

METASPLOIT = Path(__file__).parent.parent / "examples" / "metasploit.xml"

_KEYS = {
    "why_accepted",
    "confidence_proof",
    "risk_proof",
    "blast_proof",
    "effort_proof",
    "assumptions",
    "alternatives_rejected",
}


def _meta_paths():
    findings, assets = load_scan_files([METASPLOIT])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths, _ = discover_attack_paths(findings, assets, correlated, validations)
    return paths


def test_builder_shape():
    ap = build_accepted_proof(
        why_accepted=["x"],
        confidence_proof={"a": 1},
        risk_proof={"b": 2},
        blast_proof={"reachable_count": 5},
        effort_proof={"effort": "low"},
        assumptions=["y"],
        alternatives_rejected=[],
    )
    assert isinstance(ap, AcceptedPathProof)
    assert set(ap.to_dict().keys()) == _KEYS


def test_every_accepted_path_has_acceptance_proof():
    paths = _meta_paths()
    assert paths
    for p in paths:
        ap = p.accepted_proof
        assert set(ap.keys()) == _KEYS
        assert ap["why_accepted"], "why_accepted must be non-empty"
        assert ap["confidence_proof"], "must carry confidence proof"
        assert ap["risk_proof"], "must carry risk proof"
        assert ap["blast_proof"], "must carry blast proof"
        assert ap["effort_proof"], "must carry effort proof"


def test_accepted_path_has_effort_and_blast_proofs_on_model():
    for p in _meta_paths():
        assert p.effort_proof.get("effort")
        assert p.blast_proof.get("reachable_count", 0) >= 1
