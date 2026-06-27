"""Credential intelligence — what an observed secret can unlock, with evidence.

Maps concrete credential artifacts (AWS keys, GitHub tokens, JWTs, API keys,
SSH private keys, database credentials, session cookies, .env secrets) to the
node they may unlock. Nothing is assumed: a credential reaches ``verified`` only
when corroborating evidence for the target is also observed.

    GOOD:  AWS key observed + IAM role reference observed  -> candidate/partial path
    BAD:   AWS key observed (alone)                        -> NOT root access
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from vayne.attack_paths.intel._common import (
    NONE,
    blob,
    derive_status,
    intel_confidence,
)
from vayne.models import AttackCapability


@dataclass(frozen=True)
class CredentialCapability:
    """What a credential type can unlock if corroborated."""

    unlocks_node_type: str          # graph node type the credential authenticates to
    capability: AttackCapability    # attacker capability gained
    relationship: str               # edge relationship label
    outcome: str                    # human-readable access outcome


@dataclass(frozen=True)
class CredentialRecord:
    """A class of credential and how to detect/interpret it."""

    cred_type: str                  # canonical credential identifier
    node_type: str                  # graph node type for the credential itself
    detect_patterns: tuple[str, ...]            # regex patterns (case-insensitive)
    corroboration_markers: tuple[str, ...]      # evidence proving the target exists
    grants: CredentialCapability
    description: str = ""


@dataclass
class CredentialApplicabilityResult:
    cred_type: str
    node_type: str
    matched_value: str
    status: str
    capability: AttackCapability | None
    unlocks_node_type: str
    relationship: str
    outcome: str
    confidence: int
    evidence_markers: list[str] = field(default_factory=list)
    breakdown: list[str] = field(default_factory=list)


# Canonical credential knowledge base. Each entry is deterministic and explicit.
CREDENTIAL_KB: tuple[CredentialRecord, ...] = (
    CredentialRecord(
        cred_type="aws_access_key",
        node_type="api_key",
        detect_patterns=(r"(?:AKIA|ASIA)[0-9A-Z]{16}",),
        corroboration_markers=("arn:aws:iam", "role/", "assume", "sts:", "iam"),
        grants=CredentialCapability(
            unlocks_node_type="iam_role",
            capability=AttackCapability.CREDENTIAL_ACCESS,
            relationship="authenticates_as",
            outcome="AWS API access as the key's principal",
        ),
        description="AWS access key id; corroborated by an IAM role/assume reference.",
    ),
    CredentialRecord(
        cred_type="aws_secret_key",
        node_type="secret",
        detect_patterns=(r"aws_secret_access_key\s*[=:]\s*[A-Za-z0-9/+]{20,}",),
        corroboration_markers=("akia", "asia", "arn:aws:iam", "aws_access_key"),
        grants=CredentialCapability(
            unlocks_node_type="iam_role",
            capability=AttackCapability.CREDENTIAL_ACCESS,
            relationship="authenticates_as",
            outcome="AWS API access (secret + access key pair)",
        ),
        description="AWS secret access key; corroborated by a paired access key id.",
    ),
    CredentialRecord(
        cred_type="github_token",
        node_type="api_key",
        detect_patterns=(r"gh[pousr]_[A-Za-z0-9]{20,}",),
        corroboration_markers=("github", "repo", "git", "actions", "registry"),
        grants=CredentialCapability(
            unlocks_node_type="cloud_resource",
            capability=AttackCapability.CREDENTIAL_ACCESS,
            relationship="authenticates_to",
            outcome="GitHub API / repository access",
        ),
        description="GitHub personal/OAuth token.",
    ),
    CredentialRecord(
        cred_type="jwt",
        node_type="jwt",
        detect_patterns=(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}",),
        corroboration_markers=("service account", "serviceaccount", "aud", "role", "iss", "sub"),
        grants=CredentialCapability(
            unlocks_node_type="service_account",
            capability=AttackCapability.CREDENTIAL_ACCESS,
            relationship="authenticates_as",
            outcome="authenticated as the JWT subject/service account",
        ),
        description="JSON Web Token; corroborated by service-account/role claims.",
    ),
    CredentialRecord(
        cred_type="ssh_private_key",
        node_type="ssh_key",
        detect_patterns=(
            r"-----BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY-----",
            r"id_rsa\b",
        ),
        corroboration_markers=("ssh", "22/tcp", "authorized_keys", "host", "known_hosts"),
        grants=CredentialCapability(
            unlocks_node_type="endpoint",
            capability=AttackCapability.LATERAL_MOVEMENT,
            relationship="authenticates_to",
            outcome="SSH shell access to the target host",
        ),
        description="SSH private key; corroborated by a reachable SSH host.",
    ),
    CredentialRecord(
        cred_type="db_credential",
        node_type="credential",
        detect_patterns=(
            r"(?:postgres|mysql|mongodb|redis)://[^\s:@/]+:[^\s:@/]+@[\w.-]+",
            r"db_password\s*[=:]\s*\S+",
        ),
        corroboration_markers=("database", "postgres", "mysql", "mongodb", "redis", "rds", "5432", "3306"),
        grants=CredentialCapability(
            unlocks_node_type="database",
            capability=AttackCapability.CREDENTIAL_ACCESS,
            relationship="authenticates_to",
            outcome="database login with the embedded credentials",
        ),
        description="Database credential embedded in a connection string or env var.",
    ),
    CredentialRecord(
        cred_type="api_key",
        node_type="api_key",
        detect_patterns=(
            r"api[_-]?key\s*[=:]\s*[A-Za-z0-9_\-]{16,}",
            r"x-api-key\s*[:=]\s*[A-Za-z0-9_\-]{16,}",
        ),
        corroboration_markers=("api", "endpoint", "service", "authorization", "bearer"),
        grants=CredentialCapability(
            unlocks_node_type="cloud_resource",
            capability=AttackCapability.CREDENTIAL_ACCESS,
            relationship="authenticates_to",
            outcome="authenticated API access",
        ),
        description="Generic API key.",
    ),
    CredentialRecord(
        cred_type="session_cookie",
        node_type="session",
        detect_patterns=(
            r"set-cookie:\s*\w+=",
            r"session(?:id)?\s*[=:]\s*[A-Za-z0-9%._-]{12,}",
        ),
        corroboration_markers=("session", "cookie", "authenticated", "login", "user"),
        grants=CredentialCapability(
            unlocks_node_type="identity",
            capability=AttackCapability.CREDENTIAL_ACCESS,
            relationship="impersonates",
            outcome="session hijack / user impersonation",
        ),
        description="Session cookie usable for impersonation.",
    ),
    CredentialRecord(
        cred_type="env_secret",
        node_type="secret",
        detect_patterns=(
            r"(?:secret|password|passwd|token)\s*[=:]\s*\S{6,}",
            r"\.env\b",
        ),
        corroboration_markers=("env", "config", "secret", "credential", "exposed"),
        grants=CredentialCapability(
            unlocks_node_type="secret",
            capability=AttackCapability.CREDENTIAL_ACCESS,
            relationship="exposes",
            outcome="access to the exposed secret material",
        ),
        description="Generic secret found in an environment/config file.",
    ),
)


def _matched_corroboration(text: str, record: CredentialRecord) -> list[str]:
    found: list[str] = []
    for m in record.corroboration_markers:
        if m.lower() in text:
            found.append(m)
    return found


def evaluate_credential(
    record: CredentialRecord, evidence: list[str]
) -> CredentialApplicabilityResult:
    """Evaluate one credential class against evidence. Never assumes validity."""
    text = blob(evidence)
    matched_value = ""
    primary_found = False
    for pat in record.detect_patterns:
        m = re.search(pat, " ".join(evidence), re.I)
        if m:
            primary_found = True
            matched_value = m.group(0)
            break

    if not primary_found:
        return CredentialApplicabilityResult(
            cred_type=record.cred_type,
            node_type=record.node_type,
            matched_value="",
            status=NONE,
            capability=None,
            unlocks_node_type=record.grants.unlocks_node_type,
            relationship=record.grants.relationship,
            outcome=record.grants.outcome,
            confidence=0,
            evidence_markers=[],
            breakdown=[f"{record.cred_type}: no credential artifact observed -> none"],
        )

    corroborations = _matched_corroboration(text, record)
    status = derive_status(
        primary_found=True,
        corroborated=bool(corroborations),
        prerequisite_met=True,
    )
    confidence, breakdown = intel_confidence(status, len(corroborations))
    breakdown.insert(0, f"{record.cred_type}: artifact observed ({matched_value[:12]}...)")
    if corroborations:
        breakdown.insert(1, f"corroborated by: {', '.join(corroborations)}")
    else:
        breakdown.insert(1, "no corroborating target reference -> candidate only")

    return CredentialApplicabilityResult(
        cred_type=record.cred_type,
        node_type=record.node_type,
        matched_value=matched_value,
        status=status,
        capability=record.grants.capability,
        unlocks_node_type=record.grants.unlocks_node_type,
        relationship=record.grants.relationship,
        outcome=record.grants.outcome,
        confidence=confidence,
        evidence_markers=corroborations,
        breakdown=breakdown,
    )


def analyze_credentials(evidence: list[str]) -> list[CredentialApplicabilityResult]:
    """Return applicability results for every credential class observed."""
    results: list[CredentialApplicabilityResult] = []
    for record in CREDENTIAL_KB:
        res = evaluate_credential(record, evidence)
        if res.status != NONE:
            results.append(res)
    return results
