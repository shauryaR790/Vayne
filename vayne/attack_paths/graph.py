"""Attack path graph engine using NetworkX."""

from __future__ import annotations

import uuid

import networkx as nx

from vayne.models import AttackPath, AttackPathNode, CorrelatedFinding

# Known attack chain templates keyed by tag combinations
CHAIN_TEMPLATES: list[dict] = [
    {
        "title": "ATTACK PATH #1 — S3 → IAM → Production",
        "tags": {"s3", "iam", "database"},
        "nodes": [
            ("internet", "Internet", "entry", "low"),
            ("cdn", "CDN", "distribution", "medium"),
            ("s3", "S3 Bucket", "storage", "high"),
            ("iam", "IAM", "identity", "critical"),
            ("prod", "Production DB", "database", "critical"),
        ],
        "edges": ["public exposure", "write access", "admin role", "lateral move"],
        "blast": "Full production data compromise",
    },
    {
        "title": "ATTACK PATH #2 — GitHub → AWS → Secrets → Production",
        "tags": {"github", "secrets", "iam"},
        "nodes": [
            ("internet", "Internet", "entry", "low"),
            ("github", "GitHub", "scm", "medium"),
            ("leak", "Leaked Key", "credential", "high"),
            ("sm", "Secrets Manager", "secrets", "critical"),
            ("prod", "Production", "cloud", "critical"),
        ],
        "edges": ["repo exposure", "credential leak", "secret read", "account takeover"],
        "blast": "Cloud account takeover and secret exfiltration",
    },
    {
        "title": "ATTACK PATH #3 — Internet → Apache RCE",
        "tags": {"apache"},
        "nodes": [
            ("internet", "Internet", "entry", "low"),
            ("edge", "Edge Server", "web", "high"),
            ("apache", "Apache", "application", "critical"),
            ("shell", "Host Shell", "compute", "critical"),
        ],
        "edges": ["reachable", "version match", "RCE", "persistence"],
        "blast": "Remote code execution on edge infrastructure",
    },
]


def discover_attack_paths(
    correlated: list[CorrelatedFinding],
) -> list[AttackPath]:
    tag_set = set()
    for c in correlated:
        tag_set.update(c.tags)

    paths: list[AttackPath] = []
    for tmpl in CHAIN_TEMPLATES:
        if tmpl["tags"] & tag_set:
            paths.append(_build_path(tmpl, correlated))

    if not paths and correlated:
        paths.append(_generic_path(correlated[0]))

    return paths


def build_graph(paths: list[AttackPath]) -> nx.DiGraph:
    g = nx.DiGraph()
    for path in paths:
        for i, node in enumerate(path.nodes):
            g.add_node(node.id, label=node.label, type=node.asset_type)
            if i > 0:
                prev = path.nodes[i - 1]
                label = path.edge_labels[i - 1] if i - 1 < len(path.edge_labels) else ""
                g.add_edge(prev.id, node.id, label=label)
    return g


def _build_path(tmpl: dict, correlated: list[CorrelatedFinding]) -> AttackPath:
    nodes = [
        AttackPathNode(id=nid, label=label, asset_type=atype, risk_level=risk)
        for nid, label, atype, risk in tmpl["nodes"]
    ]
    avg_conf = sum(c.confidence for c in correlated) // max(len(correlated), 1)
    risk = _risk_score(nodes)

    return AttackPath(
        id=uuid.uuid4().hex[:8],
        title=tmpl["title"],
        nodes=nodes,
        edge_labels=tmpl["edges"],
        risk_score=risk,
        exploitability=min(10.0, risk),
        complexity="low" if risk >= 8 else "medium",
        blast_radius=tmpl["blast"],
        exploit_time="<15 minutes" if risk >= 8.5 else "30-90 minutes",
        confidence=min(99, avg_conf + 10),
    )


def _generic_path(primary: CorrelatedFinding) -> AttackPath:
    nodes = [
        AttackPathNode(id="internet", label="Internet", asset_type="entry", risk_level="low"),
        AttackPathNode(
            id="target",
            label=primary.host,
            asset_type=primary.service or "asset",
            risk_level=primary.severity,
        ),
        AttackPathNode(
            id="impact",
            label="Business Impact",
            asset_type="impact",
            risk_level="high",
        ),
    ]
    return AttackPath(
        id=uuid.uuid4().hex[:8],
        title=f"ATTACK PATH — {primary.title}",
        nodes=nodes,
        edge_labels=["exposure", "exploit"],
        risk_score=6.0,
        exploitability=5.5,
        complexity="medium",
        blast_radius="Service compromise",
        exploit_time="1-4 hours",
        confidence=primary.confidence,
    )


def _risk_score(nodes: list[AttackPathNode]) -> float:
    weights = {"low": 2, "medium": 5, "high": 8, "critical": 9.5, "info": 1}
    total = sum(weights.get(n.risk_level.lower(), 4) for n in nodes)
    return round(min(10.0, total / len(nodes) + 1), 1)
