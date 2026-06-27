"""Capability transition matrix tests (Step B).

Covers valid transitions, invalid (logically impossible) transitions,
privilege-escalation / lateral-movement loops, and Metasploitable
backward-compatibility (path count, confidence, risk, capability chains).
"""

from pathlib import Path

from vayne.attack_paths.capabilities import (
    CAPABILITY_TRANSITIONS,
    transition_allowed,
    transitions_are_valid,
)
from vayne.attack_paths.discovery import discover_attack_paths
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.models import AttackCapability as Cap
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

EXAMPLES = Path(__file__).parent.parent / "examples"
METASPLOIT = EXAMPLES / "metasploit.xml"


def _discover(scan_path: Path):
    findings, assets = load_scan_files([scan_path])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    paths, proof = discover_attack_paths(findings, assets, correlated, validations)
    return paths, proof


# --------------------------------------------------------------------------
# Required capabilities exist
# --------------------------------------------------------------------------

def test_required_capabilities_present():
    for name in (
        "INITIAL_ACCESS",
        "EXECUTION",
        "PERSISTENCE",
        "PRIVILEGE_ESCALATION",
        "LATERAL_MOVEMENT",
        "DATA_ACCESS",
        "DOMAIN_COMPROMISE",
    ):
        assert hasattr(Cap, name), f"missing capability {name}"


# --------------------------------------------------------------------------
# Valid transitions (the user-specified matrix)
# --------------------------------------------------------------------------

def test_valid_transitions_from_spec():
    valid_pairs = [
        (Cap.INITIAL_ACCESS, Cap.EXECUTION),
        (Cap.EXECUTION, Cap.PRIVILEGE_ESCALATION),
        (Cap.EXECUTION, Cap.LATERAL_MOVEMENT),
        (Cap.PRIVILEGE_ESCALATION, Cap.LATERAL_MOVEMENT),
        (Cap.LATERAL_MOVEMENT, Cap.DATA_ACCESS),
        (Cap.LATERAL_MOVEMENT, Cap.DOMAIN_COMPROMISE),
        (Cap.DATA_ACCESS, Cap.PERSISTENCE),
    ]
    for src, dst in valid_pairs:
        assert transition_allowed(src, dst), f"{src.value} -> {dst.value} should be valid"


def test_code_execution_is_alias_for_execution():
    # Backward-compat: existing graphs emit CODE_EXECUTION, matrix uses EXECUTION.
    assert transition_allowed(Cap.INITIAL_ACCESS, Cap.CODE_EXECUTION)
    assert transition_allowed(Cap.CODE_EXECUTION, Cap.PRIVILEGE_ESCALATION)


def test_valid_full_chain():
    chain = [
        Cap.INITIAL_ACCESS,
        Cap.EXECUTION,
        Cap.PRIVILEGE_ESCALATION,
        Cap.LATERAL_MOVEMENT,
        Cap.DATA_ACCESS,
        Cap.PERSISTENCE,
    ]
    ok, issues = transitions_are_valid(chain)
    assert ok, issues


# --------------------------------------------------------------------------
# Invalid / logically impossible transitions
# --------------------------------------------------------------------------

def test_invalid_transitions_rejected():
    invalid_pairs = [
        # INITIAL_ACCESS -> DOMAIN_COMPROMISE (skip the whole chain)
        (Cap.INITIAL_ACCESS, Cap.DOMAIN_COMPROMISE),
        # SERVICE -> DATABASE without credentials => INITIAL_ACCESS -> DATA_ACCESS
        (Cap.INITIAL_ACCESS, Cap.DATA_ACCESS),
        # CVE -> DOMAIN_ADMIN without privesc => EXECUTION -> DOMAIN_COMPROMISE
        (Cap.EXECUTION, Cap.DOMAIN_COMPROMISE),
        (Cap.CODE_EXECUTION, Cap.DOMAIN_COMPROMISE),
    ]
    for src, dst in invalid_pairs:
        assert not transition_allowed(src, dst), (
            f"{src.value} -> {dst.value} should be impossible"
        )


def test_invalid_chain_reports_issue():
    chain = [Cap.INITIAL_ACCESS, Cap.DOMAIN_COMPROMISE]
    ok, issues = transitions_are_valid(chain)
    assert not ok
    assert any("domain_compromise" in i for i in issues)


def test_software_to_secret_requires_intermediate():
    # software node is skipped (no capability); secret -> CREDENTIAL_ACCESS.
    # Reaching DATA_ACCESS directly from initial access is rejected.
    chain = [Cap.INITIAL_ACCESS, Cap.DATA_ACCESS]
    ok, _ = transitions_are_valid(chain)
    assert not ok


# --------------------------------------------------------------------------
# Loops are permitted (privesc <-> lateral movement)
# --------------------------------------------------------------------------

def test_privilege_escalation_loop_is_valid():
    # escalate, move laterally, escalate again on the new host
    chain = [
        Cap.INITIAL_ACCESS,
        Cap.EXECUTION,
        Cap.PRIVILEGE_ESCALATION,
        Cap.LATERAL_MOVEMENT,
        Cap.PRIVILEGE_ESCALATION,
    ]
    ok, issues = transitions_are_valid(chain)
    assert ok, issues


def test_lateral_movement_loop_is_valid():
    chain = [
        Cap.INITIAL_ACCESS,
        Cap.EXECUTION,
        Cap.LATERAL_MOVEMENT,
        Cap.PRIVILEGE_ESCALATION,
        Cap.LATERAL_MOVEMENT,
        Cap.DATA_ACCESS,
    ]
    ok, issues = transitions_are_valid(chain)
    assert ok, issues


def test_self_transition_allowed():
    ok, _ = transitions_are_valid([Cap.LATERAL_MOVEMENT, Cap.LATERAL_MOVEMENT])
    assert ok


# --------------------------------------------------------------------------
# Matrix structural sanity
# --------------------------------------------------------------------------

def test_matrix_covers_all_canonical_stages():
    for stage in (
        Cap.INITIAL_ACCESS,
        Cap.EXECUTION,
        Cap.CREDENTIAL_ACCESS,
        Cap.PRIVILEGE_ESCALATION,
        Cap.LATERAL_MOVEMENT,
        Cap.DATA_ACCESS,
        Cap.DOMAIN_COMPROMISE,
        Cap.PERSISTENCE,
    ):
        assert stage in CAPABILITY_TRANSITIONS


# --------------------------------------------------------------------------
# Metasploitable backward-compatibility
# --------------------------------------------------------------------------

def test_metasploitable_still_four_paths():
    paths, _ = _discover(METASPLOIT)
    assert len(paths) == 4


def test_metasploitable_chains_pass_transition_validation():
    paths, _ = _discover(METASPLOIT)
    for p in paths:
        caps = [Cap(c) for c in p.capability_chain]
        ok, issues = transitions_are_valid(caps)
        assert ok, f"path {p.id} rejected by transition layer: {issues}"


def test_metasploitable_no_paths_rejected_for_transitions():
    _, proof = _discover(METASPLOIT)
    pd = proof.path_discovery
    reasons = " ".join(pd.rejected_path_reasons if pd else [])
    assert "impossible capability transition" not in reasons
