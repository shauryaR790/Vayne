"""Credential intelligence tests (Phase C)."""

from vayne.attack_paths.intel._common import CANDIDATE, NONE, VERIFIED
from vayne.attack_paths.intel.credential_intel import (
    CREDENTIAL_KB,
    analyze_credentials,
    evaluate_credential,
)
from vayne.models import AttackCapability


def _by_type(results, cred_type):
    return next((r for r in results if r.cred_type == cred_type), None)


def test_aws_key_with_iam_reference_is_verified():
    evidence = [
        "Exposed AWS access key AKIAABCDEFGHIJKLMNOP found in bucket listing",
        "Bucket policy grants sts:AssumeRole to arn:aws:iam::123456789012:role/AdminRole",
    ]
    res = _by_type(analyze_credentials(evidence), "aws_access_key")
    assert res is not None
    assert res.status == VERIFIED
    assert res.unlocks_node_type == "iam_role"
    assert res.capability == AttackCapability.CREDENTIAL_ACCESS


def test_aws_key_alone_is_only_candidate_not_root():
    # BAD example: AWS key observed alone must NOT imply root/admin access.
    evidence = ["Exposed AWS access key AKIAABCDEFGHIJKLMNOP in a log file"]
    res = _by_type(analyze_credentials(evidence), "aws_access_key")
    assert res is not None
    assert res.status == CANDIDATE
    assert res.capability != AttackCapability.DOMAIN_COMPROMISE
    assert res.confidence < 60


def test_jwt_unlocks_service_account():
    evidence = [
        "Authorization: Bearer eyJhbGciOiJIUzI1Nibug.eyJzdWIiOiJzdmMtcGF5bWVudHMifQ.c2lnbmF0dXJl",
        "JWT subject maps to a kubernetes service account",
    ]
    res = _by_type(analyze_credentials(evidence), "jwt")
    assert res is not None
    assert res.status == VERIFIED
    assert res.unlocks_node_type == "service_account"


def test_ssh_private_key_unlocks_host_via_lateral():
    evidence = [
        "-----BEGIN OPENSSH PRIVATE KEY----- leaked in repo",
        "Key present in authorized_keys on ssh host 10.0.0.5 (22/tcp open)",
    ]
    res = _by_type(analyze_credentials(evidence), "ssh_private_key")
    assert res is not None
    assert res.status == VERIFIED
    assert res.capability == AttackCapability.LATERAL_MOVEMENT
    assert res.unlocks_node_type == "endpoint"


def test_database_credential_unlocks_database():
    evidence = ["Connection string postgres://app:s3cr3tpw@db.prod:5432/app in .env"]
    res = _by_type(analyze_credentials(evidence), "db_credential")
    assert res is not None
    assert res.status == VERIFIED
    assert res.unlocks_node_type == "database"


def test_no_evidence_yields_no_credentials():
    assert analyze_credentials([]) == []
    assert analyze_credentials(["just a benign banner line"]) == []


def test_every_record_returns_none_without_primary_artifact():
    for record in CREDENTIAL_KB:
        res = evaluate_credential(record, ["nothing relevant here"])
        assert res.status == NONE
        assert res.confidence == 0
        assert res.capability is None
