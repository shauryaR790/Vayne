"""Identity escalation intelligence tests (Phase C)."""

from vayne.attack_paths.discovery import discover_attack_paths
from vayne.attack_paths.intel._common import NONE, PARTIAL, VERIFIED
from vayne.attack_paths.intel.identity_intel import (
    IDENTITY_KB,
    analyze_escalations,
    evaluate_escalation,
)
from vayne.models import (
    Asset,
    AttackCapability,
    Classification,
    CorrelatedFinding,
    ValidationResult,
)


def _by_mechanism(results, mechanism):
    return next((r for r in results if r.mechanism == mechanism), None)


def test_sudo_escalation_to_root():
    evidence = ["/etc/sudoers: user ALL=(ALL) NOPASSWD: ALL grants root (uid=0)"]
    res = _by_mechanism(analyze_escalations(evidence), "sudo")
    assert res is not None
    assert res.status == VERIFIED
    assert res.capability == AttackCapability.PRIVILEGE_ESCALATION


def test_assume_role_chain():
    evidence = ["Principal may sts:AssumeRole arn:aws:iam::1:role/Privileged"]
    res = _by_mechanism(analyze_escalations(evidence), "assume_role")
    assert res is not None
    assert res.status == VERIFIED
    assert res.to_node_type == "iam_role"


def test_service_account_to_cluster_admin():
    evidence = [
        "ClusterRoleBinding binds the kubernetes serviceaccount to cluster-admin",
    ]
    res = _by_mechanism(analyze_escalations(evidence), "cluster_admin")
    assert res is not None
    assert res.status == VERIFIED


def test_iam_admin_policy_yields_domain_compromise():
    evidence = [
        "Role has AdministratorAccess policy (iam:PutUserPolicy) on the account "
        "arn:aws:iam::123456789012:role/Ops",
    ]
    res = _by_mechanism(analyze_escalations(evidence), "iam_admin")
    assert res is not None
    assert res.status == VERIFIED
    assert res.capability == AttackCapability.DOMAIN_COMPROMISE


def test_impossible_privilege_escalation_rejected():
    # No escalation primitive -> no privilege escalation produced at all.
    evidence = ["Exposed AWS access key AKIAEXAMPLE with no policy information"]
    results = analyze_escalations(evidence)
    assert all(r.capability != AttackCapability.DOMAIN_COMPROMISE for r in results)
    assert _by_mechanism(results, "iam_admin") is None
    assert _by_mechanism(results, "domain_admin") is None


def test_partial_when_primitive_without_target():
    evidence = ["sudo present"]
    res = _by_mechanism(analyze_escalations(evidence), "sudo")
    assert res is not None
    assert res.status in (PARTIAL, VERIFIED)


def test_no_evidence_yields_no_escalations():
    assert analyze_escalations([]) == []
    for record in IDENTITY_KB:
        assert evaluate_escalation(record, ["benign"]).status == NONE


# --- Integration: AWS key alone must NOT reach domain compromise -----------

def _discover(evidence, host="idhost", port=443):
    cf = CorrelatedFinding(
        id="f-id",
        title="Service with RCE and exposed key",
        host=host,
        port=port,
        severity="high",
        cve="CVE-2099-0002",
        evidence=evidence,
        sources=["burp"],
    )
    assets = [Asset(host=host, ip="10.0.0.10", ports=[port])]
    validations = {
        cf.id: ValidationResult(
            host_alive=True,
            port_open=True,
            service_exists=True,
            cve_applicable=True,
            prerequisites_met=True,
            reachable=True,
            confidence=90,
            classification=Classification.CONFIRMED,
        )
    }
    return discover_attack_paths([], assets, [cf], validations)


def test_aws_key_alone_does_not_reach_domain_compromise():
    evidence = [
        "Exposed AWS access key AKIAABCDEFGHIJKLMNOP and role arn:aws:iam::1:role/AppRole",
    ]
    paths, _ = _discover(evidence)
    assert all("domain_compromise" not in p.capability_chain for p in paths)
