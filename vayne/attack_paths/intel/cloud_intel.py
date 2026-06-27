"""Cloud intelligence — evidence-backed cloud trust/permission relationships.

Covers S3, IAM, STS AssumeRole, RDS, Lambda, EC2, Secrets Manager, Security
Groups, Azure identities, and GCP service accounts. A relationship is only
``verified`` when evidence for the trust/permission AND the target resource is
observed. No inferred privilege escalation.

    AWS key -> IAM role -> AssumeRole trust -> RDS access -> database compromise
"""

from __future__ import annotations

from dataclasses import dataclass, field

from vayne.attack_paths.intel._common import (
    NONE,
    blob,
    derive_status,
    intel_confidence,
)
from vayne.models import AttackCapability


@dataclass(frozen=True)
class CloudCapability:
    capability: AttackCapability
    relationship: str
    outcome: str


@dataclass(frozen=True)
class CloudRelationship:
    """A directed cloud trust/permission edge gated on evidence."""

    rel_id: str
    source_kind: str                 # logical source (e.g. "iam_role")
    target_kind: str                 # logical target (e.g. "rds")
    target_node_type: str            # graph node type to create for the target
    trust_markers: tuple[str, ...]   # evidence proving the trust/permission
    target_markers: tuple[str, ...]  # evidence proving the target resource exists
    grants: CloudCapability
    description: str = ""


@dataclass
class CloudApplicabilityResult:
    rel_id: str
    source_kind: str
    target_kind: str
    target_node_type: str
    status: str
    capability: AttackCapability
    relationship: str
    outcome: str
    confidence: int
    trust_evidence: list[str] = field(default_factory=list)
    target_evidence: list[str] = field(default_factory=list)
    breakdown: list[str] = field(default_factory=list)


CLOUD_KB: tuple[CloudRelationship, ...] = (
    CloudRelationship(
        rel_id="s3_public_exposes_secret",
        source_kind="s3_bucket",
        target_kind="secret",
        target_node_type="secret",
        trust_markers=("public", "acl public", "public-read", "public-write", "anonymous"),
        target_markers=("bucket", "s3", ".env", "secret", "access key", "credential"),
        grants=CloudCapability(
            AttackCapability.CREDENTIAL_ACCESS,
            "exposes",
            "secret material readable from public S3 bucket",
        ),
        description="Publicly readable S3 bucket exposing secret material.",
    ),
    CloudRelationship(
        rel_id="iam_assume_role",
        source_kind="iam_principal",
        target_kind="iam_role",
        target_node_type="iam_role",
        trust_markers=("sts:assumerole", "assume role", "assumerole", "trust policy"),
        target_markers=("arn:aws:iam", "role/"),
        grants=CloudCapability(
            AttackCapability.PRIVILEGE_ESCALATION,
            "grants_assume_role",
            "assumed IAM role via STS AssumeRole trust",
        ),
        description="STS AssumeRole trust toward a named IAM role.",
    ),
    CloudRelationship(
        rel_id="role_rds_access",
        source_kind="iam_role",
        target_kind="rds",
        target_node_type="rds",
        trust_markers=("rds:", "rds-db:connect", "rds access", "iam database auth"),
        target_markers=("rds", "amazonaws.com", "5432", "3306", "aurora", "postgres", "mysql"),
        grants=CloudCapability(
            AttackCapability.DATA_ACCESS,
            "accesses",
            "RDS database access through assumed role permissions",
        ),
        description="IAM role with RDS connect permission to an RDS instance.",
    ),
    CloudRelationship(
        rel_id="secretsmanager_read",
        source_kind="iam_role",
        target_kind="secrets_manager",
        target_node_type="secret",
        trust_markers=("secretsmanager:getsecretvalue", "secretsmanager:", "secrets manager"),
        target_markers=("secretsmanager", "secret", "arn:aws:secretsmanager"),
        grants=CloudCapability(
            AttackCapability.DATA_ACCESS,
            "reads_secret",
            "retrieved secret from AWS Secrets Manager",
        ),
        description="IAM permission to read a Secrets Manager secret.",
    ),
    CloudRelationship(
        rel_id="lambda_invoke",
        source_kind="iam_role",
        target_kind="lambda",
        target_node_type="cloud_resource",
        trust_markers=("lambda:invokefunction", "lambda:", "invoke function"),
        target_markers=("lambda", "function", "arn:aws:lambda"),
        grants=CloudCapability(
            AttackCapability.EXECUTION,
            "invokes",
            "code execution via Lambda function invocation",
        ),
        description="IAM permission to invoke a Lambda function.",
    ),
    CloudRelationship(
        rel_id="ec2_access",
        source_kind="iam_role",
        target_kind="ec2",
        target_node_type="cloud_resource",
        trust_markers=("ec2:", "ssm:sendcommand", "instance profile"),
        target_markers=("ec2", "instance", "i-0", "arn:aws:ec2"),
        grants=CloudCapability(
            AttackCapability.LATERAL_MOVEMENT,
            "controls",
            "control of EC2 instance via IAM/SSM",
        ),
        description="IAM permission to control an EC2 instance.",
    ),
    CloudRelationship(
        rel_id="security_group_reachability",
        source_kind="security_group",
        target_kind="cloud_resource",
        target_node_type="cloud_resource",
        trust_markers=("0.0.0.0/0", "ingress", "security group", "allow all"),
        target_markers=("sg-", "security group", "ingress", "port"),
        grants=CloudCapability(
            AttackCapability.LATERAL_MOVEMENT,
            "reaches",
            "network reachability via permissive security group",
        ),
        description="Permissive security group enabling reachability.",
    ),
    CloudRelationship(
        rel_id="azure_identity_assume",
        source_kind="azure_identity",
        target_kind="cloud_resource",
        target_node_type="iam_role",
        trust_markers=("managed identity", "azure ad", "service principal", "az role assignment"),
        target_markers=("azure", "subscription", "resourcegroup", "tenant"),
        grants=CloudCapability(
            AttackCapability.PRIVILEGE_ESCALATION,
            "assumes",
            "assumed Azure managed identity / service principal",
        ),
        description="Azure managed identity or service principal assumption.",
    ),
    CloudRelationship(
        rel_id="gcp_service_account_impersonate",
        source_kind="gcp_identity",
        target_kind="service_account",
        target_node_type="service_account",
        trust_markers=(
            "iam.serviceaccounts.actas",
            "serviceaccounttokencreator",
            "impersonate",
        ),
        target_markers=("gserviceaccount.com", "service account", "gcp", "project"),
        grants=CloudCapability(
            AttackCapability.PRIVILEGE_ESCALATION,
            "impersonates",
            "impersonated GCP service account",
        ),
        description="GCP service-account impersonation permission.",
    ),
)


def evaluate_cloud_relationship(
    rel: CloudRelationship, evidence: list[str]
) -> CloudApplicabilityResult:
    """Evaluate one cloud relationship. Requires trust + target evidence."""
    text = blob(evidence)
    trust = [m for m in rel.trust_markers if m.lower() in text]
    target = [m for m in rel.target_markers if m.lower() in text]

    primary_found = bool(trust)
    status = derive_status(
        primary_found=primary_found,
        corroborated=bool(target),
        prerequisite_met=True,
    )
    corroboration_count = len(target) + max(len(trust) - 1, 0)
    confidence, breakdown = intel_confidence(status, corroboration_count)
    if status == NONE:
        breakdown = [f"{rel.rel_id}: no trust/permission evidence -> none"]
    else:
        breakdown.insert(0, f"{rel.rel_id}: trust={trust or 'none'} target={target or 'none'}")

    return CloudApplicabilityResult(
        rel_id=rel.rel_id,
        source_kind=rel.source_kind,
        target_kind=rel.target_kind,
        target_node_type=rel.target_node_type,
        status=status,
        capability=rel.grants.capability,
        relationship=rel.grants.relationship,
        outcome=rel.grants.outcome,
        confidence=confidence,
        trust_evidence=trust,
        target_evidence=target,
        breakdown=breakdown,
    )


def analyze_cloud(evidence: list[str]) -> list[CloudApplicabilityResult]:
    """Return applicability results for every cloud relationship with trust evidence."""
    results: list[CloudApplicabilityResult] = []
    for rel in CLOUD_KB:
        res = evaluate_cloud_relationship(rel, evidence)
        if res.status != NONE:
            results.append(res)
    return results
