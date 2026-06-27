"""Extract concrete graph entities from scan evidence — no semantic bridges."""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlparse

from vayne.models import Asset, CorrelatedFinding

ARN_RE = re.compile(r"arn:aws:iam::\d+:role/[\w-]+", re.I)
CONN_RE = re.compile(r"(postgres|mysql|mongodb|redis)://[\w.-]+:\d+[^\s]*", re.I)
DB_URL_RE = re.compile(r"database_url\s*=\s*[^\s]+", re.I)
BUCKET_HOST_RE = re.compile(r"[\w.-]+\.s3[\w.-]*\.amazonaws\.com", re.I)
AWS_KEY_RE = re.compile(r"(?:AKIA|ASIA)[0-9A-Z]{16}")
GH_TOKEN_RE = re.compile(r"ghp_[a-zA-Z0-9]{20,}")
ACCESS_KEY_PHRASE_RE = re.compile(r"(exposed aws access key[^.;]{0,80})", re.I)
URL_RE = re.compile(r"https?://[\w.-]+[^\s\"']*", re.I)


@dataclass(frozen=True)
class EvidenceEntity:
    node_id: str
    node_type: str
    label: str
    edge_type: str
    evidence: str
    discovered_from: list[str]
    artifact_type: str
    position: int


def _slug(value: str) -> str:
    return re.sub(r"[^\w.-]+", "-", value.lower()).strip("-")[:80]


def _is_bucket_url(url: str, context: str) -> bool:
    lower = f"{url} {context}".lower()
    if ".s3." in lower or "s3.amazonaws.com" in lower:
        return True
    if "/public" in url.lower() and ("bucket" in lower or "s3" in lower):
        return True
    return False


def extract_entities(cf: CorrelatedFinding, asset: Asset | None) -> list[EvidenceEntity]:
    """Extract artifacts from finding evidence — one validated entity per match."""
    found: list[tuple[int, EvidenceEntity]] = []
    context = f"{cf.title} {' '.join(cf.evidence)}"

    for ev_idx, ev in enumerate(cf.evidence):
        for m in ARN_RE.finditer(ev):
            arn = m.group(0)
            found.append((
                m.start() + ev_idx * 10000,
                EvidenceEntity(
                    node_id=f"identity:{_slug(arn)}",
                    node_type="identity",
                    label=arn,
                    edge_type="grants_assume_role",
                    evidence=ev[max(0, m.start() - 20) : m.end() + 40].strip(),
                    discovered_from=[f"IAM role ARN in scan evidence: {arn}"],
                    artifact_type="iam_role_arn",
                    position=m.start(),
                ),
            ))

        for m in CONN_RE.finditer(ev):
            conn = m.group(0)
            found.append((
                m.start() + ev_idx * 10000,
                EvidenceEntity(
                    node_id=f"database:{_slug(conn)}",
                    node_type="database",
                    label=conn,
                    edge_type="references",
                    evidence=conn,
                    discovered_from=[f"Connection string in scan evidence: {conn}"],
                    artifact_type="connection_string",
                    position=m.start(),
                ),
            ))

        for m in DB_URL_RE.finditer(ev):
            snippet = m.group(0)
            found.append((
                m.start() + ev_idx * 10000,
                EvidenceEntity(
                    node_id=f"database:{_slug(snippet)}",
                    node_type="database",
                    label=snippet,
                    edge_type="references",
                    evidence=snippet,
                    discovered_from=[f"DATABASE_URL in scan evidence: {snippet}"],
                    artifact_type="env_variable",
                    position=m.start(),
                ),
            ))

        for m in BUCKET_HOST_RE.finditer(ev):
            bucket = m.group(0)
            found.append((
                m.start() + ev_idx * 10000,
                EvidenceEntity(
                    node_id=f"endpoint:{_slug(bucket)}",
                    node_type="endpoint",
                    label=bucket,
                    edge_type="exposes",
                    evidence=ev[max(0, m.start() - 30) : m.end() + 30].strip(),
                    discovered_from=[f"S3 bucket hostname in evidence: {bucket}"],
                    artifact_type="bucket",
                    position=m.start(),
                ),
            ))

        for m in AWS_KEY_RE.finditer(ev):
            key = m.group(0)
            found.append((
                m.start() + ev_idx * 10000,
                EvidenceEntity(
                    node_id=f"credential:{_slug(key)}",
                    node_type="credential",
                    label=f"AWS key {key[:8]}...",
                    edge_type="leaks",
                    evidence=ev[max(0, m.start() - 20) : m.end() + 20].strip(),
                    discovered_from=["AWS access key literal in scan evidence"],
                    artifact_type="aws_access_key",
                    position=m.start(),
                ),
            ))

        for m in GH_TOKEN_RE.finditer(ev):
            token = m.group(0)
            found.append((
                m.start() + ev_idx * 10000,
                EvidenceEntity(
                    node_id=f"credential:{_slug(token)}",
                    node_type="credential",
                    label=f"github-token:{token[:8]}...",
                    edge_type="leaks",
                    evidence=ev[max(0, m.start() - 20) : m.end() + 20].strip(),
                    discovered_from=["GitHub token literal in scan evidence"],
                    artifact_type="github_token",
                    position=m.start(),
                ),
            ))

        for m in ACCESS_KEY_PHRASE_RE.finditer(ev):
            phrase = m.group(1).strip()
            found.append((
                m.start() + ev_idx * 10000,
                EvidenceEntity(
                    node_id=f"credential:{cf.host}:exposed-access-key",
                    node_type="credential",
                    label="exposed-aws-access-key",
                    edge_type="exposes",
                    evidence=phrase,
                    discovered_from=[f"Scan evidence: {phrase}"],
                    artifact_type="exposed_credential_reference",
                    position=m.start(),
                ),
            ))

        for m in URL_RE.finditer(ev):
            url = m.group(0).rstrip("/.,;")
            if _is_bucket_url(url, context):
                parsed = urlparse(url)
                path = parsed.path.strip("/") or "public"
                label = f"{parsed.hostname}/{path}" if parsed.hostname else url
                found.append((
                    m.start() + ev_idx * 10000,
                    EvidenceEntity(
                        node_id=f"endpoint:{_slug(url)}",
                        node_type="endpoint",
                        label=url,
                        edge_type="exposes",
                        evidence=url,
                        discovered_from=[f"S3/bucket URL in scan evidence: {url}"],
                        artifact_type="bucket_path",
                        position=m.start(),
                    ),
                ))
            else:
                found.append((
                    m.start() + ev_idx * 10000,
                    EvidenceEntity(
                        node_id=f"endpoint:{_slug(url)}",
                        node_type="endpoint",
                        label=url,
                        edge_type="exploits",
                        evidence=url,
                        discovered_from=[f"URL endpoint in scan evidence: {url}"],
                        artifact_type="url_endpoint",
                        position=m.start(),
                    ),
                ))

    order: list[EvidenceEntity] = []
    seen: set[str] = set()
    for pos, ent in sorted(found, key=lambda x: x[0]):
        if ent.node_id in seen:
            continue
        seen.add(ent.node_id)
        order.append(ent)
    return order


def privilege_edge_evidence(evidence: list[str]) -> str | None:
    for ev in evidence:
        normalized = ev.replace(" ", "").lower()
        if "sts:assumerole" in normalized or "assume role" in ev.lower():
            return ev[:200].strip()
    return None
