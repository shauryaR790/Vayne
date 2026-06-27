"""Structural attack-path signatures (Phase H).

Every rule matches ONLY on typed graph facts:
  - node_type
  - edge relationship
  - edge artifact_type
  - node capability (explicit field)
  - applicability_status / node id prefix (verified exploit structure)
  - distinct host assets (lateral host-to-host)

No free-text keyword scoring on evidence blobs.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from vayne.models.attack_categories import AttackCategory

# Capability normalization — execution aliases treated as equivalent.
EXECUTION_CAPS = frozenset({"execution", "code_execution"})

CREDENTIAL_NODE_TYPES = frozenset({
    "credential", "api_key", "jwt", "ssh_key", "secret", "session",
})
CLOUD_NODE_TYPES = frozenset({
    "cloud_resource", "iam_role", "service_account", "rds", "storage", "bucket",
})
IDENTITY_NODE_TYPES = frozenset({
    "identity", "role", "iam_role", "service_account", "admin",
})
DOMAIN_NODE_TYPES = frozenset({"domain", "admin"})
ESCALATION_NODE_TYPES = frozenset({"identity", "admin", "role", "iam_role", "service_account"})
DATA_NODE_TYPES = frozenset({
    "database", "bucket", "storage", "rds", "redis", "secret", "data",
})
CONTAINER_NODE_TYPES = frozenset({"container", "pod", "kubernetes"})
SUPPLY_CHAIN_NODE_TYPES = frozenset({"github_repo", "ci_cd", "pipeline", "webhook"})

LATERAL_EDGE_RELATIONSHIPS = frozenset({
    "reuses_credential_on",
    "shares_password_with",
    "ssh_key_accepted_by",
    "iam_trust_to",
    "kerberos_trust_to",
    "domain_trust_to",
    "connects_to",
})
CLOUD_EDGE_RELATIONSHIPS = frozenset({
    "grants_assume_role",
    "assumes_role",
    "iam_trust_to",
})
CREDENTIAL_EDGE_RELATIONSHIPS = frozenset({
    "leaks",
    "exposes",
    "authenticates_as",
    "authenticates_to",
    "impersonates",
})


@dataclass
class PathContext:
    path: list[str]
    node_types: set[str]
    capabilities: list[str]
    capability_set: set[str]
    edge_relationships: list[str]
    edge_relationship_set: set[str]
    edge_artifact_types: set[str]
    node_labels: dict[str, str]
    node_ids_by_type: dict[str, list[str]]
    verified_exploit: bool
    access_outcome: bool
    distinct_hosts: int


@dataclass
class SignatureMatch:
    category: AttackCategory
    rule_id: str
    matched_nodes: list[str] = field(default_factory=list)
    matched_capabilities: list[str] = field(default_factory=list)
    matched_edges: list[str] = field(default_factory=list)
    explanation: list[str] = field(default_factory=list)


def _has_cap(ctx: PathContext, cap: str) -> bool:
    if cap in ("execution", "code_execution"):
        return bool(ctx.capability_set & EXECUTION_CAPS)
    return cap in ctx.capability_set


def _nodes_of_types(ctx: PathContext, types: frozenset[str]) -> list[str]:
    out: list[str] = []
    for nt in types:
        out.extend(ctx.node_ids_by_type.get(nt, []))
    return out


def _labels(ctx: PathContext, nids: list[str]) -> list[str]:
    return [ctx.node_labels.get(n, n) for n in nids]


def _match_domain_compromise(ctx: PathContext) -> SignatureMatch | None:
    if _has_cap(ctx, "domain_compromise"):
        nodes = _nodes_of_types(ctx, DOMAIN_NODE_TYPES)
        return SignatureMatch(
            AttackCategory.DOMAIN_COMPROMISE,
            "domain_compromise_capability",
            matched_nodes=_labels(ctx, nodes or ctx.path[-1:]),
            matched_capabilities=["domain_compromise"],
            explanation=["domain_compromise capability on path"],
        )
    nodes = _nodes_of_types(ctx, {"domain"})
    if nodes and (_has_cap(ctx, "privilege_escalation") or _has_cap(ctx, "domain_compromise")):
        return SignatureMatch(
            AttackCategory.DOMAIN_COMPROMISE,
            "domain_admin_node",
            matched_nodes=_labels(ctx, nodes),
            matched_capabilities=[c for c in ctx.capabilities if c in ("privilege_escalation", "domain_compromise")],
            explanation=["domain node with privilege escalation"],
        )
    return None


def _match_container_escape(ctx: PathContext) -> SignatureMatch | None:
    nodes = _nodes_of_types(ctx, CONTAINER_NODE_TYPES)
    if not nodes:
        return None
    if _has_cap(ctx, "privilege_escalation") or "kubernetes" in ctx.node_types:
        return SignatureMatch(
            AttackCategory.CONTAINER_ESCAPE,
            "container_orchestration_escape",
            matched_nodes=_labels(ctx, nodes),
            matched_capabilities=[c for c in ctx.capabilities if c in ("privilege_escalation", "execution", "code_execution")],
            explanation=["container/kubernetes node with escalation or execution"],
        )
    return None


def _match_supply_chain(ctx: PathContext) -> SignatureMatch | None:
    nodes = _nodes_of_types(ctx, SUPPLY_CHAIN_NODE_TYPES)
    if not nodes:
        return None
    return SignatureMatch(
        AttackCategory.SUPPLY_CHAIN,
        "supply_chain_artifact",
        matched_nodes=_labels(ctx, nodes),
        matched_capabilities=ctx.capabilities[:3],
        explanation=["supply-chain node type on path (repo/ci/pipeline/webhook)"],
    )


def _match_cloud_attack(ctx: PathContext) -> SignatureMatch | None:
    cloud_nodes = _nodes_of_types(ctx, CLOUD_NODE_TYPES)
    if not cloud_nodes:
        return None
    cred_nodes = _nodes_of_types(ctx, CREDENTIAL_NODE_TYPES)
    cloud_edges = [r for r in ctx.edge_relationships if r in CLOUD_EDGE_RELATIONSHIPS]
    if cred_nodes or cloud_edges or ("iam_role" in ctx.node_types and "rds" in ctx.node_types):
        return SignatureMatch(
            AttackCategory.CLOUD_ATTACK,
            "cloud_resource_chain",
            matched_nodes=_labels(ctx, cloud_nodes + cred_nodes),
            matched_capabilities=[c for c in ctx.capabilities if c in ("credential_access", "privilege_escalation", "data_access", "lateral_movement")],
            matched_edges=cloud_edges,
            explanation=["cloud node types with credential or IAM chain evidence"],
        )
    return None


def _match_data_exfiltration(ctx: PathContext) -> SignatureMatch | None:
    data_nodes = _nodes_of_types(ctx, DATA_NODE_TYPES)
    if not data_nodes:
        return None
    if _has_cap(ctx, "data_access") or any(nt in ctx.node_types for nt in ("database", "rds", "bucket", "storage", "redis")):
        return SignatureMatch(
            AttackCategory.DATA_EXFILTRATION,
            "data_access_target",
            matched_nodes=_labels(ctx, data_nodes),
            matched_capabilities=[c for c in ctx.capabilities if c == "data_access"] or ["data_access"],
            explanation=["data_access capability with database/storage target"],
        )
    return None


def _match_identity_attack(ctx: PathContext) -> SignatureMatch | None:
    id_nodes = _nodes_of_types(ctx, IDENTITY_NODE_TYPES)
    if not id_nodes:
        return None
    if "domain" in ctx.node_types:
        return None  # domain handled by DOMAIN_COMPROMISE
    if _has_cap(ctx, "privilege_escalation") or _has_cap(ctx, "credential_access"):
        return SignatureMatch(
            AttackCategory.IDENTITY_ATTACK,
            "identity_escalation",
            matched_nodes=_labels(ctx, id_nodes),
            matched_capabilities=[c for c in ctx.capabilities if c in ("privilege_escalation", "credential_access")],
            explanation=["identity/iam node with escalation or credential access"],
        )
    return None


def _match_credential_attack(ctx: PathContext) -> SignatureMatch | None:
    cred_nodes = _nodes_of_types(ctx, CREDENTIAL_NODE_TYPES)
    cred_edges = [r for r in ctx.edge_relationships if r in CREDENTIAL_EDGE_RELATIONSHIPS]
    if not cred_nodes and not cred_edges:
        return None
    if _has_cap(ctx, "credential_access") or cred_nodes:
        return SignatureMatch(
            AttackCategory.CREDENTIAL_ATTACK,
            "credential_access_nodes",
            matched_nodes=_labels(ctx, cred_nodes),
            matched_capabilities=[c for c in ctx.capabilities if c == "credential_access"] or ["credential_access"],
            matched_edges=cred_edges,
            explanation=["credential_access capability with credential/secret node types"],
        )
    return None


def _match_lateral_movement(ctx: PathContext) -> SignatureMatch | None:
    lat_edges = [r for r in ctx.edge_relationships if r in LATERAL_EDGE_RELATIONSHIPS]
    if _has_cap(ctx, "lateral_movement") or lat_edges or ctx.distinct_hosts >= 2:
        nodes = _nodes_of_types(ctx, frozenset({"asset", "endpoint"}))
        return SignatureMatch(
            AttackCategory.LATERAL_MOVEMENT,
            "lateral_pivot",
            matched_nodes=_labels(ctx, nodes[:4]),
            matched_capabilities=[c for c in ctx.capabilities if c == "lateral_movement"] or (["lateral_movement"] if ctx.distinct_hosts >= 2 else []),
            matched_edges=lat_edges,
            explanation=[
                "lateral_movement capability"
                if _has_cap(ctx, "lateral_movement")
                else f"host-to-host movement ({ctx.distinct_hosts} hosts)"
                if ctx.distinct_hosts >= 2
                else "lateral pivot edge relationship",
            ],
        )
    return None


def _match_privilege_escalation(ctx: PathContext) -> SignatureMatch | None:
    esc_nodes = _nodes_of_types(ctx, ESCALATION_NODE_TYPES)
    if not _has_cap(ctx, "privilege_escalation") and not esc_nodes:
        return None
    if _has_cap(ctx, "privilege_escalation") and esc_nodes:
        return SignatureMatch(
            AttackCategory.PRIVILEGE_ESCALATION,
            "privilege_escalation_chain",
            matched_nodes=_labels(ctx, esc_nodes),
            matched_capabilities=["privilege_escalation"],
            explanation=["privilege_escalation capability with identity/admin node"],
        )
    return None


def _match_remote_rce(ctx: PathContext) -> SignatureMatch | None:
    if not _has_cap(ctx, "initial_access"):
        return None
    if not (_has_cap(ctx, "execution") or _has_cap(ctx, "code_execution")):
        return None
    if not ctx.verified_exploit:
        return None
    if not ctx.access_outcome:
        return None
    exploit_nodes = [
        n for n in ctx.path
        if n.startswith("cve_verified:") or n.startswith("access:") or n.startswith("exploit:")
    ]
    return SignatureMatch(
        AttackCategory.REMOTE_RCE,
        "verified_rce_chain",
        matched_nodes=_labels(ctx, exploit_nodes or ctx.path[-2:]),
        matched_capabilities=[
            c for c in ctx.capabilities
            if c in ("initial_access", "execution", "code_execution")
        ],
        matched_edges=[r for r in ctx.edge_relationships if r in ("yields_access", "enables", "exploits")],
        explanation=[
            "verified exploit on path",
            "access_outcome edge (remote execution)",
            "initial_access → execution capability chain",
        ],
    )


# Priority order: most specific structural class first.
_MATCHERS = (
    _match_domain_compromise,
    _match_container_escape,
    _match_supply_chain,
    _match_cloud_attack,
    _match_data_exfiltration,
    _match_identity_attack,
    _match_credential_attack,
    _match_lateral_movement,
    _match_privilege_escalation,
    _match_remote_rce,
)
