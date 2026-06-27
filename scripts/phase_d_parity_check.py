"""Phase D parity + determinism check (not a pytest; run directly).

Compares beam search vs the legacy all_simple_paths fallback on the bundled
fixtures, and verifies the exact Metasploitable confidence/risk expectations
plus 100x determinism of beam search.
"""

from __future__ import annotations

from pathlib import Path

import vayne.attack_paths.search.search_engine as se
from vayne.attack_paths.discovery import discover_attack_paths
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

EXAMPLES = Path(__file__).parent.parent / "examples"
METASPLOIT = EXAMPLES / "metasploit.xml"
FIRSTRUN = EXAMPLES / "scan_results" / "firstrun.xml"


def _inputs(scan_path: Path):
    findings, assets = load_scan_files([scan_path])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    return findings, assets, correlated, validations


def _run(scan_path: Path, mode: str):
    se.SEARCH_MODE = mode
    findings, assets, correlated, validations = _inputs(scan_path)
    # patch discovery's imported reference too
    import vayne.attack_paths.discovery as disc

    disc.SEARCH_MODE = mode
    paths, proof = discover_attack_paths(findings, assets, correlated, validations)
    return paths, proof


def _signature(paths):
    return [
        (
            tuple(n.id for n in p.nodes),
            p.confidence,
            round(p.risk_score, 1),
        )
        for p in paths
    ]


def check_parity(scan_path: Path, name: str):
    beam, beam_proof = _run(scan_path, "beam")
    legacy, _ = _run(scan_path, "all_simple_paths")
    beam_sig = _signature(beam)
    legacy_sig = _signature(legacy)
    ok = beam_sig == legacy_sig
    print(f"[{name}] beam paths={len(beam)} legacy paths={len(legacy)} parity={ok}")
    print(f"[{name}] beam algorithm: {beam_proof.path_discovery.algorithm}")
    print(
        f"[{name}] states_expanded={beam_proof.path_discovery.search_states_expanded} "
        f"branches_pruned={beam_proof.path_discovery.search_branches_pruned} "
        f"prune_reasons={beam_proof.path_discovery.search_prune_reasons}"
    )
    if not ok:
        print(f"  BEAM:   {beam_sig}")
        print(f"  LEGACY: {legacy_sig}")
    return ok, beam


def check_determinism(scan_path: Path, n: int = 100):
    base = None
    for _ in range(n):
        paths, _ = _run(scan_path, "beam")
        sig = _signature(paths)
        if base is None:
            base = sig
        elif sig != base:
            print(f"DETERMINISM FAIL on run: {sig} != {base}")
            return False
    print(f"[determinism] {n} runs identical: {base}")
    return True


def main():
    all_ok = True

    ok_m, beam_m = check_parity(METASPLOIT, "metasploitable")
    all_ok &= ok_m

    confs = sorted(p.confidence for p in beam_m)
    risks = sorted(round(p.risk_score, 1) for p in beam_m)
    print(f"[metasploitable] paths={len(beam_m)} confidence={confs} risk={risks}")
    exp_paths = len(beam_m) == 4
    exp_conf = confs == [83, 92, 100, 100]
    exp_risk = risks == [6.5, 7.2, 8.6, 8.6]
    print(
        f"[metasploitable] expected paths=4:{exp_paths} "
        f"conf{{83,92,100,100}}:{exp_conf} risk{{6.5,7.2,8.6,8.6}}:{exp_risk}"
    )
    all_ok &= exp_paths and exp_conf and exp_risk

    ok_f, _ = check_parity(FIRSTRUN, "firstrun")
    all_ok &= ok_f

    all_ok &= check_determinism(METASPLOIT)

    print("\nPHASE D PARITY:", "PASS" if all_ok else "FAIL")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
