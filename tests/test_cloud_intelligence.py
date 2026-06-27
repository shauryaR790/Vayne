"""Cloud intelligence tests (Phase C), incl. end-to-end AWS -> IAM -> RDS."""

from vayne.attack_paths.discovery import discover_attack_paths
from vayne.attack_paths.intel._common import NONE, VERIFIED
from vayne.attack_paths.intel.cloud_intel import (
    CLOUD_KB,
    analyze_cloud,
    evaluate_cloud_relationship,
)
from vayne.models import (
    Asset,
    AttackCapability,
    Classification,
    CorrelatedFinding,
    ValidationResult,
)


def _by_id(results, rel_id):
    return next((r for r in results if r.rel_id == rel_id), None)


def test_assume_role_trust_is_verified():
    evidence = [
        "Bucket policy grants sts:AssumeRole to arn:aws:iam::123456789012:role/AppRole",
    ]
    res = _by_id(analyze_cloud(evidence), "iam_assume_role")
    assert res is not None
    assert res.status == VERIFIED
    assert res.capability == AttackCapability.PRIVILEGE_ESCALATION


def test_rds_access_requires_trust_evidence():
    # Target reference alone (no rds permission marker) must NOT verify access.
    evidence = ["postgres database reachable at db.example.com:5432"]
    res = _by_id(analyze_cloud(evidence), "role_rds_access")
    assert res is None or res.status != VERIFIED


def test_rds_access_verified_with_permission_and_target():
    evidence = [
        "Assumed role allows rds-db:connect to RDS postgres "
        "at app.abcd.us-east-1.rds.amazonaws.com:5432",
    ]
    res = _by_id(analyze_cloud(evidence), "role_rds_access")
    assert res is not None
    assert res.status == VERIFIED
    assert res.capability == AttackCapability.DATA_ACCESS


def test_s3_public_exposes_secret():
    evidence = ["Public-read S3 bucket exposes .env with an access key"]
    res = _by_id(analyze_cloud(evidence), "s3_public_exposes_secret")
    assert res is not None
    assert res.status == VERIFIED


def test_no_evidence_yields_no_cloud_relationships():
    assert analyze_cloud([]) == []
    for rel in CLOUD_KB:
        assert evaluate_cloud_relationship(rel, ["benign"]).status == NONE


# --- End-to-end integration: AWS key -> IAM role -> RDS -> data access ------

def _confirmed_validation() -> ValidationResult:
    return ValidationResult(
        host_alive=True,
        port_open=True,
        service_exists=True,
        version_matches=True,
        cve_applicable=True,
        prerequisites_met=True,
        reachable=True,
        confidence=90,
        classification=Classification.CONFIRMED,
    )


def _discover(evidence, host="cloudhost", port=443):
    cf = CorrelatedFinding(
        id="f-cloud",
        title="Cloud service misconfiguration with RCE",
        host=host,
        port=port,
        severity="high",
        cve="CVE-2099-0001",
        evidence=evidence,
        sources=["burp"],
    )
    assets = [Asset(host=host, ip="10.0.0.9", ports=[port])]
    validations = {cf.id: _confirmed_validation()}
    return discover_attack_paths([], assets, [cf], validations)


def test_end_to_end_aws_to_iam_to_rds_path():
    evidence = [
        "Exposed AWS access key AKIAABCDEFGHIJKLMNOP in public bucket",
        "Bucket policy grants sts:AssumeRole to arn:aws:iam::123456789012:role/AppRole",
        "Assumed role allows rds-db:connect to RDS postgres "
        "at app.abcd.us-east-1.rds.amazonaws.com:5432",
    ]
    paths, _ = _discover(evidence)
    rds_paths = [
        p for p in paths
        if any(n.node_type.value == "rds" for n in p.nodes)
        and "data_access" in p.capability_chain
    ]
    assert rds_paths, "expected an evidence-backed AWS->IAM->RDS data-access path"
    chain = rds_paths[0].capability_chain
    assert chain.index("credential_access") < chain.index("data_access")


def test_service_to_database_without_credentials_is_rejected():
    # Only a database reference, no credential / assume-role / rds permission.
    evidence = ["A postgres database exists at db.example.com:5432"]
    paths, _ = _discover(evidence)
    assert all("data_access" not in p.capability_chain for p in paths)
