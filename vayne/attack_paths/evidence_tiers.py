"""Evidence tier classification — TIER1 observed, TIER2 derived, TIER3 inferred."""

from __future__ import annotations

from vayne.models import EvidenceTier

TIER1_TOOLS = frozenset({"nmap", "nuclei", "burp", "httpx", "nessus", "openvas", "naabu", "katana"})
TIER1_ARTIFACTS = frozenset({
    "finding", "scan_inventory", "open_port", "url_endpoint", "bucket", "bucket_path",
    "iam_role_arn", "connection_string", "env_variable", "aws_access_key",
    "github_token", "exposed_credential_reference", "leaked_credential",
})
TIER2_ARTIFACTS = frozenset({
    "service_fingerprint", "cve_enrichment", "cve_mapping",
    "cve_candidate", "cve_prerequisite", "cve_verified", "access_outcome",
})
TIER3_ARTIFACTS = frozenset({"inferred", "hypothesis"})


def tier_for_edge(
    source_tool: str,
    artifact_type: str,
    *,
    is_inventory: bool = False,
) -> EvidenceTier:
    tool = (source_tool or "").lower()
    if is_inventory or tool in TIER1_TOOLS or artifact_type in TIER1_ARTIFACTS:
        return EvidenceTier.TIER1
    if artifact_type in TIER2_ARTIFACTS:
        return EvidenceTier.TIER2
    if artifact_type in TIER3_ARTIFACTS:
        return EvidenceTier.TIER3
    if tool == "scan":
        return EvidenceTier.TIER1
    return EvidenceTier.TIER2


def tier_for_node(node_type: str, *, from_enrichment: bool = False) -> EvidenceTier:
    if from_enrichment:
        return EvidenceTier.TIER2
    if node_type in ("asset", "service", "endpoint", "credential", "identity", "database"):
        return EvidenceTier.TIER1
    if node_type == "software":
        return EvidenceTier.TIER1
    if node_type == "vulnerability":
        return EvidenceTier.TIER1
    return EvidenceTier.TIER2
