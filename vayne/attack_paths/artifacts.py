"""Cross-host relationship artifacts — edges require explicit scan evidence."""

from __future__ import annotations

import re
from dataclasses import dataclass

from vayne.models import Asset

# Each pattern must match literal artifact text in finding evidence
ARTIFACT_RULES: list[tuple[re.Pattern[str], str, str]] = [
    (
        re.compile(r"database_url\s*=\s*[^\s]+", re.I),
        "env_variable",
        "DATABASE_URL environment variable",
    ),
    (
        re.compile(r"(postgres|mysql|mongodb|redis)://[\w.-]+:\d+[^\s]*", re.I),
        "connection_string",
        "database connection string",
    ),
    (
        re.compile(r"rds:[*\w]+", re.I),
        "iam_policy",
        "IAM policy permission (rds:*)",
    ),
    (
        re.compile(r"arn:aws:iam::\d+:role/[\w-]+", re.I),
        "iam_role_arn",
        "IAM role ARN in policy",
    ),
    (
        re.compile(r"(?:access|secret)[\s_-]?key[\s=:]+[\w/+]{10,}", re.I),
        "leaked_credential",
        "exposed access/secret key",
    ),
    (
        re.compile(r"\.env[\"']?\s*(?:file|found|exposed|leak)", re.I),
        "config_file",
        "exposed .env configuration file",
    ),
]

# Cross-host asset links only from these artifact types
CROSS_HOST_ARTIFACT_TYPES = frozenset({
    "env_variable",
    "connection_string",
    "iam_policy",
    "leaked_credential",
    "config_file",
})


@dataclass
class CrossHostLink:
    target_host: str
    artifact_snippet: str
    artifact_type: str
    artifact_label: str


def find_cross_host_links(
    evidence: list[str], assets: list[Asset], source_host: str
) -> list[CrossHostLink]:
    """Return cross-host links ONLY when an artifact snippet names a discovered host."""
    discovered = {a.host.lower(): a for a in assets}
    links: list[CrossHostLink] = []
    seen: set[tuple[str, str]] = set()

    for ev in evidence:
        for pattern, artifact_type, label in ARTIFACT_RULES:
            if artifact_type not in CROSS_HOST_ARTIFACT_TYPES:
                continue
            for match in pattern.finditer(ev):
                snippet = match.group(0)
                snippet_lower = snippet.lower()
                for host_lower, asset in discovered.items():
                    if host_lower == source_host.lower():
                        continue
                    host_in_snippet = host_lower in snippet_lower
                    ip_in_snippet = bool(asset.ip and asset.ip in snippet)
                    if not host_in_snippet and not ip_in_snippet:
                        continue
                    key = (asset.host, artifact_type)
                    if key in seen:
                        continue
                    seen.add(key)
                    links.append(
                        CrossHostLink(
                            target_host=asset.host,
                            artifact_snippet=snippet,
                            artifact_type=artifact_type,
                            artifact_label=f"{label}: {snippet}",
                        )
                    )
    return links


def extract_iam_arn_label(evidence: list[str]) -> str:
    for ev in evidence:
        m = re.search(r"(arn:aws:iam::\d+:role/[\w-]+)", ev, re.I)
        if m:
            return m.group(1)
    return ""


def extract_credential_snippet(evidence: list[str]) -> str:
    for ev in evidence:
        for pattern, _, _ in ARTIFACT_RULES:
            if pattern.search(ev) and "key" in pattern.pattern.lower():
                return ev[:200]
    for ev in evidence:
        if "access key" in ev.lower() or "aws access" in ev.lower():
            return ev[:200]
    return ""
