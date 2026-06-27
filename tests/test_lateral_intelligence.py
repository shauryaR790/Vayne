"""Lateral movement intelligence tests (Phase C)."""

from vayne.attack_paths.intel._common import NONE, VERIFIED
from vayne.attack_paths.intel.lateral_intel import (
    LATERAL_KB,
    analyze_pivots,
    evaluate_pivot,
)
from vayne.models import AttackCapability


def _by_mechanism(results, mechanism):
    return next((r for r in results if r.mechanism == mechanism), None)


def test_credential_reuse_pivot_requires_all_three_evidence_classes():
    evidence = [
        "Recovered local admin password hash from hostA",
        "Same password accepts on hostB (authenticated)",
        "hostB reachable over tcp 445 in the same subnet",
    ]
    res = _by_mechanism(analyze_pivots(evidence), "credential_reuse")
    assert res is not None
    assert res.status == VERIFIED
    assert res.has_credential and res.has_access and res.has_route
    assert res.capability == AttackCapability.LATERAL_MOVEMENT


def test_shared_ssh_key_pivot():
    evidence = [
        "id_rsa private key recovered",
        "Key present in authorized_keys on second host (accepts key)",
        "ssh 22/tcp reachable",
    ]
    res = _by_mechanism(analyze_pivots(evidence), "shared_ssh_key")
    assert res is not None
    assert res.status == VERIFIED


def test_impossible_pivot_missing_route_is_not_verified():
    # Credential + access but NO network route -> never a verified pivot.
    evidence = [
        "Recovered password credential",
        "Password accepts / reused on target",
    ]
    res = _by_mechanism(analyze_pivots(evidence), "credential_reuse")
    assert res is None or res.status != VERIFIED


def test_impossible_pivot_credential_only_is_not_verified():
    evidence = ["A stray password string with no target and no route"]
    for res in analyze_pivots(evidence):
        assert res.status != VERIFIED
        assert not (res.has_credential and res.has_access and res.has_route)


def test_no_evidence_yields_no_pivots():
    assert analyze_pivots([]) == []
    for record in LATERAL_KB:
        assert evaluate_pivot(record, ["benign banner"]).status == NONE


def test_pivot_breakdown_names_missing_evidence():
    evidence = ["Recovered password hash", "password accepts on host"]
    res = _by_mechanism(analyze_pivots(evidence), "credential_reuse")
    assert res is not None
    assert any("missing evidence" in line for line in res.breakdown)
