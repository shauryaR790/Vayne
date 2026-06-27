"""Phase H — classification determinism over 100 runs."""

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


def _signature(paths, proof) -> str:
    return json.dumps(
        {
            "paths": [
                {
                    "nodes": [n.id for n in p.nodes],
                    "confidence": p.confidence,
                    "risk": p.risk_score,
                    "attack_category": p.attack_category,
                    "attack_category_proof": p.attack_category_proof,
                    "mitre_tactics": p.mitre_tactics,
                    "mitre_techniques": p.mitre_techniques,
                }
                for p in paths
            ],
            "path_classifications": proof.path_discovery.path_classifications,
        },
        sort_keys=True,
    )


def test_classification_identical_100_runs():
    findings, assets, correlated, validations = _inputs()
    base = None
    for _ in range(100):
        paths, proof = discover_attack_paths(findings, assets, correlated, validations)
        sig = _signature(paths, proof)
        if base is None:
            base = sig
        else:
            assert sig == base


def test_metasploitable_parity_with_classification():
    findings, assets, correlated, validations = _inputs()
    paths, _ = discover_attack_paths(findings, assets, correlated, validations)
    assert len(paths) == 4
    assert sorted(p.confidence for p in paths) == [83, 92, 100, 100]
    assert sorted(p.risk_score for p in paths) == [6.5, 7.2, 8.6, 8.6]
    assert all(p.attack_category == "remote_rce" for p in paths)
