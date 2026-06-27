"""Phase E — confidence (and its proof) is fully deterministic across runs."""

from __future__ import annotations

import json
from pathlib import Path

from vayne.attack_paths.discovery import discover_attack_paths
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

METASPLOIT = Path(__file__).parent.parent / "examples" / "metasploit.xml"


def _inputs():
    findings, assets = load_scan_files([METASPLOIT])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    return findings, assets, correlated, validations


def _signature(paths) -> str:
    return json.dumps(
        [
            {
                "nodes": [n.id for n in p.nodes],
                "confidence": p.confidence,
                "proof": p.confidence_proof,
                "edge_proofs": [e.confidence_proof for e in p.edges],
            }
            for p in paths
        ],
        sort_keys=True,
    )


def test_confidence_and_proof_identical_100_runs():
    findings, assets, correlated, validations = _inputs()
    base = None
    for _ in range(100):
        paths, _ = discover_attack_paths(findings, assets, correlated, validations)
        sig = _signature(paths)
        if base is None:
            base = sig
        else:
            assert sig == base


def test_metasploitable_confidence_set_stable():
    findings, assets, correlated, validations = _inputs()
    paths, _ = discover_attack_paths(findings, assets, correlated, validations)
    assert sorted(p.confidence for p in paths) == [83, 92, 100, 100]
