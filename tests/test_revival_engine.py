"""Phase G — revival engine maps missing evidence to collection actions."""

from __future__ import annotations

from vayne.attack_paths.proof import suggest_revival


def _actions(missing):
    return suggest_revival(missing)


def test_missing_iam_role_suggests_iam_audit():
    out = _actions(["missing iam role"])
    assert out
    assert "IAM" in out[0]["action"]
    assert any("iam" in t.lower() or "scout" in t.lower() or "pacu" in t.lower()
               for t in out[0]["tools"])


def test_missing_credential_suggests_secrets_scan():
    out = _actions(["missing credential"])
    assert out
    assert "secret" in out[0]["action"].lower() or "credential" in out[0]["action"].lower()
    assert any("trufflehog" in t.lower() or "gitleaks" in t.lower() for t in out[0]["tools"])


def test_missing_lateral_movement_suggests_bloodhound():
    out = _actions(["missing lateral movement"])
    assert out
    assert any("bloodhound" in t.lower() for t in out[0]["tools"])


def test_missing_network_route_suggests_nmap():
    out = _actions(["missing network route"])
    assert out
    assert any("nmap" in t.lower() for t in out[0]["tools"])


def test_missing_cloud_permission_suggests_iam_enumeration():
    out = _actions(["missing cloud permission"])
    assert out
    assert "iam" in out[0]["action"].lower() or "permission" in out[0]["action"].lower()


def test_each_option_has_expected_capability():
    out = _actions(["missing credential", "missing iam role", "missing lateral movement"])
    assert len(out) == 3
    for o in out:
        assert o["expected_capability"]
        assert o["missing"]


def test_revival_deterministic_and_deduplicated():
    missing = ["missing credential", "missing credential", "missing iam role"]
    a = suggest_revival(missing)
    b = suggest_revival(missing)
    assert a == b
    # duplicate (item, action) collapsed
    seen = {(o["missing"], o["action"]) for o in a}
    assert len(seen) == len(a)


def test_unknown_missing_yields_no_route():
    assert suggest_revival(["something totally unmapped xyz"]) == []
