"""Validated artifact links — no blob-to-chain inference."""

from __future__ import annotations

from dataclasses import dataclass

from vayne.attack_paths.evidence_entities import EvidenceEntity, privilege_edge_evidence
from vayne.models import CorrelatedFinding


@dataclass(frozen=True)
class ArtifactLink:
    source_id: str
    target_id: str
    edge_type: str
    evidence: str
    discovered_from: list[str]
    artifact_type: str


def _first(entities: list[EvidenceEntity], *types: str) -> EvidenceEntity | None:
    for ent in entities:
        if ent.artifact_type in types:
            return ent
    return None


def build_validated_links(
    cf: CorrelatedFinding,
    entities: list[EvidenceEntity],
    vuln_id: str,
) -> list[ArtifactLink]:
    """Create edges only when evidence supports the relationship."""
    links: list[ArtifactLink] = []
    text = " ".join(cf.evidence).lower()

    bucket = _first(entities, "bucket", "bucket_path")
    role = _first(entities, "iam_role_arn")
    cred = _first(entities, "aws_access_key", "exposed_credential_reference", "github_token")
    db = _first(entities, "connection_string", "env_variable")

    if bucket and role and privilege_edge_evidence(cf.evidence):
        priv = privilege_edge_evidence(cf.evidence) or role.evidence
        links.append(ArtifactLink(
            bucket.node_id,
            role.node_id,
            "grants_assume_role",
            priv,
            [f"AssumeRole evidenced: {priv}"],
            "iam_assume_role",
        ))
    elif role and privilege_edge_evidence(cf.evidence):
        priv = privilege_edge_evidence(cf.evidence) or role.evidence
        links.append(ArtifactLink(
            vuln_id,
            role.node_id,
            "grants_assume_role",
            priv,
            role.discovered_from,
            role.artifact_type,
        ))

    if role and cred and ("access key" in text or "token" in text):
        links.append(ArtifactLink(
            role.node_id,
            cred.node_id,
            "exposes",
            cred.evidence,
            cred.discovered_from,
            cred.artifact_type,
        ))
    elif cred and not role:
        parent = bucket.node_id if bucket else vuln_id
        links.append(ArtifactLink(
            parent,
            cred.node_id,
            "exposes",
            cred.evidence,
            cred.discovered_from,
            cred.artifact_type,
        ))

    if cred and db and ("database_url" in text or "postgres://" in text or "mysql://" in text):
        links.append(ArtifactLink(
            cred.node_id,
            db.node_id,
            "references",
            db.evidence,
            db.discovered_from,
            db.artifact_type,
        ))
    elif db and not cred:
        parent = role.node_id if role else (bucket.node_id if bucket else vuln_id)
        links.append(ArtifactLink(
            parent,
            db.node_id,
            "references",
            db.evidence,
            db.discovered_from,
            db.artifact_type,
        ))

    seen: set[tuple[str, str, str]] = set()
    unique: list[ArtifactLink] = []
    for link in links:
        key = (link.source_id, link.target_id, link.edge_type)
        if key in seen:
            continue
        seen.add(key)
        unique.append(link)
    return unique
