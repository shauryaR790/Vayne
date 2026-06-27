"""Lateral movement intelligence — evidence-gated host-to-host pivots.

A pivot is only valid when THREE independent classes of evidence are present:

    1. credential evidence  (something to authenticate with)
    2. access evidence       (the target accepts that credential / principal)
    3. route evidence        (a network path from source to target)

Missing any one -> no verified pivot. Pivots are never inferred.

    hostA credential + hostB accepts credential + network route -> valid pivot
"""

from __future__ import annotations

from dataclasses import dataclass, field

from vayne.attack_paths.intel._common import (
    CANDIDATE,
    NONE,
    PARTIAL,
    VERIFIED,
    blob,
    intel_confidence,
)
from vayne.models import AttackCapability


@dataclass(frozen=True)
class LateralMovementRecord:
    """A class of lateral movement and the evidence it requires."""

    mechanism: str
    credential_markers: tuple[str, ...]
    access_markers: tuple[str, ...]
    route_markers: tuple[str, ...]
    relationship: str
    outcome: str
    capability: AttackCapability = AttackCapability.LATERAL_MOVEMENT
    description: str = ""


@dataclass(frozen=True)
class PivotOpportunity:
    """A concrete candidate pivot between two hosts."""

    source_host: str
    target_host: str
    mechanism: str
    credential_ref: str
    access_ref: str
    route_ref: str


@dataclass
class PivotApplicabilityResult:
    mechanism: str
    source_host: str
    target_host: str
    status: str
    capability: AttackCapability
    relationship: str
    outcome: str
    confidence: int
    has_credential: bool = False
    has_access: bool = False
    has_route: bool = False
    evidence_markers: list[str] = field(default_factory=list)
    breakdown: list[str] = field(default_factory=list)


LATERAL_KB: tuple[LateralMovementRecord, ...] = (
    LateralMovementRecord(
        mechanism="credential_reuse",
        credential_markers=("password", "credential", "hash", "ntlm", "secret"),
        access_markers=("accepts", "reused", "same password", "valid on", "authenticated"),
        route_markers=("reachable", "route", "open", "tcp", "subnet", "vlan", "connected"),
        relationship="reuses_credential_on",
        outcome="authenticated to second host with reused credentials",
        description="Same credential valid on another reachable host.",
    ),
    LateralMovementRecord(
        mechanism="shared_password",
        credential_markers=("password", "shared password", "local admin password"),
        access_markers=("same password", "shared", "identical hash", "accepts"),
        route_markers=("reachable", "smb", "445", "rdp", "3389", "route"),
        relationship="shares_password_with",
        outcome="lateral movement via shared local/admin password",
        description="Shared local administrator or service password.",
    ),
    LateralMovementRecord(
        mechanism="shared_ssh_key",
        credential_markers=("ssh key", "id_rsa", "private key", "authorized_keys"),
        access_markers=("authorized_keys", "accepts key", "same key", "trusts"),
        route_markers=("22/tcp", "ssh", "reachable", "route"),
        relationship="ssh_key_accepted_by",
        outcome="SSH access to second host via reused key",
        description="SSH key trusted by another host.",
    ),
    LateralMovementRecord(
        mechanism="shared_iam_trust",
        credential_markers=("arn:aws:iam", "role", "assume"),
        access_markers=("trust policy", "assumerole", "cross-account", "trusts"),
        route_markers=("aws", "account", "vpc", "endpoint"),
        relationship="iam_trust_to",
        outcome="cross-account access via shared IAM trust",
        description="Cross-account IAM trust relationship.",
    ),
    LateralMovementRecord(
        mechanism="kerberos_trust",
        credential_markers=("ticket", "tgt", "kerberos", "krbtgt", "hash"),
        access_markers=("spn", "delegation", "trusts", "ticket accepted"),
        route_markers=("88", "kerberos", "domain", "reachable"),
        relationship="kerberos_trust_to",
        outcome="lateral movement via Kerberos ticket/delegation",
        description="Kerberos delegation or ticket reuse.",
    ),
    LateralMovementRecord(
        mechanism="domain_trust",
        credential_markers=("domain", "account", "credential"),
        access_markers=("domain trust", "forest trust", "trusts domain"),
        route_markers=("ldap", "389", "domain controller", "reachable"),
        relationship="domain_trust_to",
        outcome="lateral movement across a domain/forest trust",
        description="Active Directory domain/forest trust.",
    ),
    LateralMovementRecord(
        mechanism="service_account_reuse",
        credential_markers=("service account", "serviceaccount", "svc_", "managed identity"),
        access_markers=("reused", "same service account", "shared identity", "accepts"),
        route_markers=("reachable", "cluster", "namespace", "route"),
        relationship="service_account_reused_on",
        outcome="lateral movement via reused service account",
        description="Service-account identity reused across services.",
    ),
    LateralMovementRecord(
        mechanism="internal_service_pivot",
        credential_markers=("credential", "token", "api key", "session"),
        access_markers=("internal", "accepts", "authenticated", "backend"),
        route_markers=("internal", "private", "10.", "172.", "192.168.", "reachable"),
        relationship="pivots_to_internal",
        outcome="pivot to internal service using captured credential",
        description="Pivot to an internal-only service.",
    ),
)


def evaluate_pivot(
    record: LateralMovementRecord,
    evidence: list[str],
    *,
    source_host: str = "",
    target_host: str = "",
) -> PivotApplicabilityResult:
    """Evaluate one pivot mechanism. Requires credential + access + route."""
    text = blob(evidence)
    cred = [m for m in record.credential_markers if m.lower() in text]
    access = [m for m in record.access_markers if m.lower() in text]
    route = [m for m in record.route_markers if m.lower() in text]

    has_cred, has_access, has_route = bool(cred), bool(access), bool(route)
    present = sum((has_cred, has_access, has_route))

    if present == 0 or not has_cred:
        status = NONE
    elif has_cred and has_access and has_route:
        status = VERIFIED
    elif present == 2:
        status = PARTIAL
    else:
        status = CANDIDATE

    markers = cred + access + route
    confidence, breakdown = intel_confidence(status, max(len(markers) - 1, 0))
    if status == NONE:
        breakdown = [f"{record.mechanism}: insufficient evidence (need credential+access+route)"]
    else:
        breakdown.insert(
            0,
            f"{record.mechanism}: credential={cred or '-'} access={access or '-'} route={route or '-'}",
        )
        if status != VERIFIED:
            missing = [
                name
                for name, ok in (("credential", has_cred), ("access", has_access), ("route", has_route))
                if not ok
            ]
            breakdown.append(f"missing evidence: {', '.join(missing)} -> not a verified pivot")

    return PivotApplicabilityResult(
        mechanism=record.mechanism,
        source_host=source_host,
        target_host=target_host,
        status=status,
        capability=record.capability,
        relationship=record.relationship,
        outcome=record.outcome,
        confidence=confidence,
        has_credential=has_cred,
        has_access=has_access,
        has_route=has_route,
        evidence_markers=markers,
        breakdown=breakdown,
    )


def analyze_pivots(
    evidence: list[str], *, source_host: str = "", target_host: str = ""
) -> list[PivotApplicabilityResult]:
    """Return applicability results for every pivot mechanism with evidence."""
    results: list[PivotApplicabilityResult] = []
    for record in LATERAL_KB:
        res = evaluate_pivot(
            record, evidence, source_host=source_host, target_host=target_host
        )
        if res.status != NONE:
            results.append(res)
    return results
