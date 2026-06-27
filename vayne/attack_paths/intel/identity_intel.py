"""Identity escalation intelligence — evidence-gated privilege escalation.

Covers sudo/sudoers, local/domain admin, IAM admin, AssumeRole, service
accounts, Kubernetes cluster-admin, RBAC, impersonation, and token privilege
escalation. No privilege escalation is ever produced without explicit evidence
of the escalation mechanism.

    service account -> cluster-admin -> secret access
    IAM role        -> administrator policy -> account compromise
"""

from __future__ import annotations

from dataclasses import dataclass, field

from vayne.attack_paths.intel._common import (
    NONE,
    PARTIAL,
    VERIFIED,
    blob,
    intel_confidence,
)
from vayne.models import AttackCapability


@dataclass(frozen=True)
class IdentityEscalationRecord:
    """A privilege-escalation mechanism gated on explicit evidence."""

    mechanism: str
    from_principal: str               # logical starting principal kind
    to_principal: str                 # logical resulting principal kind
    to_node_type: str                 # graph node type for the escalated principal
    mechanism_markers: tuple[str, ...]   # evidence proving the escalation primitive
    target_markers: tuple[str, ...]      # evidence proving the elevated target exists
    capability: AttackCapability
    relationship: str
    outcome: str
    description: str = ""


@dataclass(frozen=True)
class PrivilegeStep:
    from_principal: str
    to_principal: str
    mechanism: str
    evidence: str


@dataclass(frozen=True)
class PrivilegePath:
    """An ordered, evidence-backed escalation chain."""

    steps: tuple[PrivilegeStep, ...]
    terminal_capability: AttackCapability


@dataclass
class PrivilegeApplicabilityResult:
    mechanism: str
    from_principal: str
    to_principal: str
    to_node_type: str
    status: str
    capability: AttackCapability
    relationship: str
    outcome: str
    confidence: int
    mechanism_evidence: list[str] = field(default_factory=list)
    target_evidence: list[str] = field(default_factory=list)
    breakdown: list[str] = field(default_factory=list)


IDENTITY_KB: tuple[IdentityEscalationRecord, ...] = (
    IdentityEscalationRecord(
        mechanism="sudo",
        from_principal="local_user",
        to_principal="root",
        to_node_type="admin",
        mechanism_markers=("nopasswd", "sudo", "(all : all)", "sudoers"),
        target_markers=("root", "/etc/sudoers", "all=(all)", "uid=0"),
        capability=AttackCapability.PRIVILEGE_ESCALATION,
        relationship="escalates_via_sudo",
        outcome="local root via sudo misconfiguration",
        description="Sudo/sudoers misconfiguration granting root.",
    ),
    IdentityEscalationRecord(
        mechanism="local_admin",
        from_principal="local_user",
        to_principal="local_admin",
        to_node_type="admin",
        mechanism_markers=("administrators group", "local admin", "seimpersonate", "uac bypass"),
        target_markers=("administrator", "system", "local admin"),
        capability=AttackCapability.PRIVILEGE_ESCALATION,
        relationship="escalates_to_local_admin",
        outcome="local administrator/SYSTEM privileges",
        description="Local administrator escalation primitive.",
    ),
    IdentityEscalationRecord(
        mechanism="domain_admin",
        from_principal="domain_user",
        to_principal="domain_admin",
        to_node_type="domain",
        mechanism_markers=("domain admin", "dcsync", "krbtgt", "golden ticket", "adminsdholder"),
        target_markers=("domain controller", "active directory", "domain admins", "ntds"),
        capability=AttackCapability.DOMAIN_COMPROMISE,
        relationship="escalates_to_domain_admin",
        outcome="domain compromise via Domain Admin",
        description="Domain Admin escalation (DCSync/Golden Ticket).",
    ),
    IdentityEscalationRecord(
        mechanism="iam_admin",
        from_principal="iam_role",
        to_principal="iam_admin",
        to_node_type="admin",
        mechanism_markers=(
            "administratoraccess",
            "admin policy",
            "iam:putuserpolicy",
            "iam:attachrolepolicy",
            "iam:createaccesskey",
            "*:*",
        ),
        target_markers=("arn:aws:iam", "account", "policy", "administrator"),
        capability=AttackCapability.DOMAIN_COMPROMISE,
        relationship="escalates_to_account_admin",
        outcome="AWS account compromise via administrator policy",
        description="IAM principal with administrator/privilege-grant permissions.",
    ),
    IdentityEscalationRecord(
        mechanism="assume_role",
        from_principal="iam_principal",
        to_principal="iam_role",
        to_node_type="iam_role",
        mechanism_markers=("sts:assumerole", "assume role", "assumerole"),
        target_markers=("arn:aws:iam", "role/"),
        capability=AttackCapability.PRIVILEGE_ESCALATION,
        relationship="assumes_role",
        outcome="elevated permissions of the assumed role",
        description="STS AssumeRole to a more privileged role.",
    ),
    IdentityEscalationRecord(
        mechanism="cluster_admin",
        from_principal="service_account",
        to_principal="cluster_admin",
        to_node_type="kubernetes",
        mechanism_markers=("cluster-admin", "clusterrolebinding", "rbac", "system:masters"),
        target_markers=("kubernetes", "namespace", "cluster", "kube-system", "serviceaccount"),
        capability=AttackCapability.PRIVILEGE_ESCALATION,
        relationship="binds_cluster_admin",
        outcome="Kubernetes cluster-admin via RBAC binding",
        description="Service account bound to cluster-admin via RBAC.",
    ),
    IdentityEscalationRecord(
        mechanism="impersonation",
        from_principal="user",
        to_principal="privileged_identity",
        to_node_type="identity",
        mechanism_markers=("impersonate", "act as", "actas", "delegated"),
        target_markers=("service account", "user", "principal", "role"),
        capability=AttackCapability.PRIVILEGE_ESCALATION,
        relationship="impersonates",
        outcome="privilege escalation via identity impersonation",
        description="Impersonation / act-as permission.",
    ),
    IdentityEscalationRecord(
        mechanism="token_privilege_escalation",
        from_principal="token",
        to_principal="privileged_identity",
        to_node_type="identity",
        mechanism_markers=("token", "createtoken", "tokenrequest", "steal token", "bearer"),
        target_markers=("service account", "privileged", "role", "scope"),
        capability=AttackCapability.PRIVILEGE_ESCALATION,
        relationship="escalates_via_token",
        outcome="privilege escalation via token theft/minting",
        description="Token minting/theft to assume a privileged identity.",
    ),
)


def evaluate_escalation(
    record: IdentityEscalationRecord, evidence: list[str]
) -> PrivilegeApplicabilityResult:
    """Evaluate one escalation mechanism. Requires the escalation primitive."""
    text = blob(evidence)
    mech = [m for m in record.mechanism_markers if m.lower() in text]
    target = [m for m in record.target_markers if m.lower() in text]

    if not mech:
        status = NONE
    elif target:
        status = VERIFIED
    else:
        status = PARTIAL

    corroboration = max(len(mech) - 1, 0) + len(target)
    confidence, breakdown = intel_confidence(status, corroboration)
    if status == NONE:
        breakdown = [f"{record.mechanism}: no escalation primitive observed -> none"]
    else:
        breakdown.insert(
            0, f"{record.mechanism}: mechanism={mech} target={target or 'unconfirmed'}"
        )
        if status == PARTIAL:
            breakdown.append("elevated target not confirmed -> partial (no auto-escalation)")

    return PrivilegeApplicabilityResult(
        mechanism=record.mechanism,
        from_principal=record.from_principal,
        to_principal=record.to_principal,
        to_node_type=record.to_node_type,
        status=status,
        capability=record.capability,
        relationship=record.relationship,
        outcome=record.outcome,
        confidence=confidence,
        mechanism_evidence=mech,
        target_evidence=target,
        breakdown=breakdown,
    )


def analyze_escalations(evidence: list[str]) -> list[PrivilegeApplicabilityResult]:
    """Return applicability results for every escalation mechanism with evidence."""
    results: list[PrivilegeApplicabilityResult] = []
    for record in IDENTITY_KB:
        res = evaluate_escalation(record, evidence)
        if res.status != NONE:
            results.append(res)
    return results
