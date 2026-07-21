"""Progressive investigation graph — lazy-loaded levels, never render the full enterprise graph.

Level 1: Investigation clusters (what to follow)
Level 2: Affected assets (subnet-grouped)
Level 3: Evidence (collapsed CVEs, services, cloud resources)
Level 4: Attack paths (validated chains only)
"""

from __future__ import annotations

import ipaddress
import re
from typing import Any

from product.backend.services.investigation_clustering import build_investigation_clusters

_CVE_RE = re.compile(r"CVE-\d{4}-\d+", re.I)
_CLOUD_RE = re.compile(r"(?i)(arn:aws|s3://|gs://|azure|gcp|kubernetes|k8s|pod/)")


def _node_type(node: dict[str, Any]) -> str:
    t = str(node.get("type") or "").lower()
    if t:
        return t
    nid = str(node.get("id") or "").lower()
    if nid.startswith("asset:"):
        return "asset"
    if nid.startswith("service:"):
        return "service"
    if nid.startswith("entry:"):
        return "endpoint"
    if "cve" in nid or nid.startswith("vuln"):
        return "vulnerability"
    if nid.startswith("group:"):
        return "group"
    return "unknown"


def _host_from_asset_id(node_id: str, label: str) -> str:
    if node_id.startswith("asset:"):
        return node_id.split(":", 1)[1]
    return label.strip()


def _subnet_key(host: str) -> str:
    host = host.strip()
    if not host:
        return "unknown"
    try:
        if ":" in host:
            net = ipaddress.ip_network(f"{host}/64", strict=False)
            return str(net)
        parts = host.split(".")
        if len(parts) == 4:
            return f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"
    except ValueError:
        pass
    return host


def _service_port_key(label: str, node_id: str) -> str:
    text = label or node_id
    m = re.search(r"/(tcp|udp)/(\d+)", text, re.I)
    if m:
        return f"{m.group(1).lower()}/{m.group(2)}"
    m = re.search(r":(\d+)$", text)
    if m:
        return f"tcp/{m.group(1)}"
    return text.split("@")[0].replace("service/", "")[:48]


def _cve_from_node(node: dict[str, Any]) -> str | None:
    label = str(node.get("label") or "")
    m = _CVE_RE.search(label)
    if m:
        return m.group(0).upper()
    m = _CVE_RE.search(str(node.get("id") or ""))
    return m.group(0).upper() if m else None


class _GraphIndex:
    """Lightweight adjacency index — built once per request, not persisted."""

    def __init__(self, graph: dict[str, Any]) -> None:
        self.nodes: dict[str, dict[str, Any]] = {}
        self.edges: list[dict[str, Any]] = list(graph.get("edges") or [])
        self.attack_paths: list[dict[str, Any]] = list(graph.get("attack_paths") or [])
        self.edges_from: dict[str, list[dict[str, Any]]] = {}
        self.edges_to: dict[str, list[dict[str, Any]]] = {}
        self.by_type: dict[str, list[str]] = {}
        self.finding_to_nodes: dict[str, list[str]] = {}

        for raw in graph.get("nodes") or []:
            nid = str(raw.get("id") or "")
            if not nid:
                continue
            self.nodes[nid] = raw
            t = _node_type(raw)
            self.by_type.setdefault(t, []).append(nid)
            for fid in raw.get("finding_ids") or []:
                self.finding_to_nodes.setdefault(str(fid), []).append(nid)

        for edge in self.edges:
            s, t = str(edge.get("source") or ""), str(edge.get("target") or "")
            if s:
                self.edges_from.setdefault(s, []).append(edge)
            if t:
                self.edges_to.setdefault(t, []).append(edge)

    @property
    def total_nodes(self) -> int:
        return len(self.nodes)

    @property
    def total_edges(self) -> int:
        return len(self.edges)

    def asset_node_id(self, host: str) -> str | None:
        direct = f"asset:{host}"
        if direct in self.nodes:
            return direct
        for nid, node in self.nodes.items():
            if _node_type(node) == "asset" and _host_from_asset_id(nid, str(node.get("label") or "")) == host:
                return nid
        return None

    def nodes_for_finding_ids(self, finding_ids: list[str]) -> list[str]:
        out: set[str] = set()
        for fid in finding_ids:
            out.update(self.finding_to_nodes.get(fid, []))
        return list(out)

    def neighborhood(self, root_ids: list[str], depth: int = 2) -> set[str]:
        seen: set[str] = set()
        frontier = [r for r in root_ids if r in self.nodes]
        for _ in range(depth):
            nxt: list[str] = []
            for nid in frontier:
                if nid in seen:
                    continue
                seen.add(nid)
                for e in self.edges_from.get(nid, []):
                    t = str(e.get("target") or "")
                    if t and t not in seen:
                        nxt.append(t)
                for e in self.edges_to.get(nid, []):
                    s = str(e.get("source") or "")
                    if s and s not in seen:
                        nxt.append(s)
            frontier = nxt
        return seen


def build_progressive_graph(
    *,
    graph: dict[str, Any],
    workbench: dict[str, Any] | None = None,
    level: int = 1,
    parent_id: str | None = None,
    filters: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return a visible subgraph slice for the requested level."""
    filters = filters or {}
    idx = _GraphIndex(graph)
    investigations = _investigations_from_workbench(workbench, graph)

    if level <= 1 or not parent_id:
        return _level_clusters(idx, investigations, filters)

    if parent_id.startswith("cluster:"):
        inv = _find_investigation(investigations, parent_id.removeprefix("cluster:"))
        if level == 2:
            return _level_assets(idx, inv, parent_id, filters)
        if level == 3:
            return _level_evidence(idx, inv, parent_id, filters)
        if level >= 4:
            return _level_attack_paths(idx, inv, parent_id, graph, filters)

    if parent_id.startswith("subnet:"):
        if level == 3:
            return _level_evidence_subnet(idx, investigations, parent_id, filters)
        if level >= 4:
            return _level_attack_paths(idx, _investigation_for_subnet(investigations, parent_id), parent_id, graph, filters)

    if parent_id.startswith("asset:"):
        if level == 3:
            return _level_evidence_asset(idx, parent_id, filters)
        if level >= 4:
            return _level_attack_paths(idx, None, parent_id, graph, filters)

    if parent_id.startswith("evidence:") and level >= 4:
        return _level_attack_paths(idx, None, parent_id, graph, filters)

    return _level_clusters(idx, investigations, filters)


def _investigations_from_workbench(workbench: dict[str, Any] | None, graph: dict[str, Any]) -> list[dict[str, Any]]:
    if workbench:
        invs = workbench.get("investigations") or workbench.get("priority_queue") or []
        if invs:
            return invs
        confirmed = workbench.get("confirmed_findings") or []
        paths = graph.get("attack_paths") or []
        return build_investigation_clusters(
            confirmed_findings=confirmed,
            candidate_paths=[_path_to_candidate(p) for p in paths if p.get("status") != "REJECTED"],
            hypotheses=workbench.get("hypotheses") or [],
        )
    return []


def _path_to_candidate(path: dict[str, Any]) -> dict[str, Any]:
    steps = path.get("steps") or []
    if not steps and path.get("nodes"):
        steps = [str(n.get("label") or n.get("id") or "") for n in path["nodes"]]
    return {
        "steps": steps,
        "status": "VALIDATED",
        "confidence": int(path.get("confidence") or 0),
        "risk": float(path.get("risk") or path.get("risk_score") or 0),
    }


def _find_investigation(investigations: list[dict[str, Any]], inv_id: str) -> dict[str, Any] | None:
    for inv in investigations:
        if str(inv.get("id") or "") == inv_id:
            return inv
    return None


def _investigation_for_subnet(investigations: list[dict[str, Any]], parent_id: str) -> dict[str, Any] | None:
    subnet = parent_id.removeprefix("subnet:")
    for inv in investigations:
        for host in inv.get("affected_assets") or []:
            if _subnet_key(str(host)) == subnet:
                return inv
    return None


def _cluster_node(inv: dict[str, Any]) -> dict[str, Any]:
    finding_ids = inv.get("finding_ids") or []
    assets = inv.get("affected_assets") or []
    child_count = max(len(finding_ids), len(assets), int(inv.get("evidence_count") or 1))
    return {
        "id": f"cluster:{inv.get('id')}",
        "label": str(inv.get("title") or "Investigation"),
        "type": "investigation_cluster",
        "level": 1,
        "expandable": True,
        "child_count": child_count,
        "tier": inv.get("tier"),
        "risk": min(10.0, float(inv.get("risk_score") or 0) / 10.0),
        "confidence": int(inv.get("confidence") or 0),
        "evidence": [str(inv.get("reason") or "")][:3],
        "finding_ids": finding_ids,
        "group": str(inv.get("cluster_type") or "investigation"),
    }


def _level_clusters(
    idx: _GraphIndex,
    investigations: list[dict[str, Any]],
    filters: dict[str, Any],
) -> dict[str, Any]:
    nodes = [_cluster_node(inv) for inv in investigations]
    nodes = _apply_node_filters(nodes, idx, filters)

    edges: list[dict[str, Any]] = []
    asset_to_clusters: dict[str, list[str]] = {}
    for inv in investigations:
        cid = f"cluster:{inv.get('id')}"
        for host in inv.get("affected_assets") or []:
            asset_to_clusters.setdefault(str(host), []).append(cid)

    seen_pairs: set[str] = set()
    for _host, cluster_ids in asset_to_clusters.items():
        if len(cluster_ids) < 2:
            continue
        for i in range(len(cluster_ids)):
            for j in range(i + 1, len(cluster_ids)):
                key = "::".join(sorted([cluster_ids[i], cluster_ids[j]]))
                if key in seen_pairs:
                    continue
                seen_pairs.add(key)
                edges.append(
                    {
                        "source": cluster_ids[i],
                        "target": cluster_ids[j],
                        "relationship": "shared_asset",
                        "confidence": 60,
                        "category": "correlation",
                    }
                )

    return _response(
        level=1,
        parent_id=None,
        idx=idx,
        nodes=nodes,
        edges=edges,
        breadcrumb=[{"id": "root", "label": "Investigations"}],
    )


def _level_assets(
    idx: _GraphIndex,
    inv: dict[str, Any] | None,
    parent_id: str,
    filters: dict[str, Any],
) -> dict[str, Any]:
    inv = inv or {}
    hosts: set[str] = set(str(h) for h in (inv.get("affected_assets") or []) if h)
    for fid in inv.get("finding_ids") or []:
        for nid in idx.nodes_for_finding_ids([str(fid)]):
            node = idx.nodes[nid]
            if _node_type(node) == "asset":
                hosts.add(_host_from_asset_id(nid, str(node.get("label") or "")))

    by_subnet: dict[str, list[str]] = {}
    for host in sorted(hosts):
        by_subnet.setdefault(_subnet_key(host), []).append(host)

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    cluster_id = parent_id

    for subnet, subnet_hosts in sorted(by_subnet.items()):
        if len(subnet_hosts) >= 2:
            sid = f"subnet:{subnet}"
            nodes.append(
                {
                    "id": sid,
                    "label": f"{subnet} · {len(subnet_hosts)} hosts",
                    "type": "subnet_cluster",
                    "level": 2,
                    "expandable": True,
                    "child_count": len(subnet_hosts),
                    "risk": max(_host_risk(idx, h) for h in subnet_hosts),
                    "group": subnet,
                    "evidence": [f"{len(subnet_hosts)} hosts in subnet"],
                }
            )
            edges.append(
                {
                    "source": cluster_id,
                    "target": sid,
                    "relationship": "contains",
                    "confidence": 90,
                }
            )
            for host in subnet_hosts:
                aid = f"asset:{host}"
                nodes.append(_asset_node(idx, host, child_count=_asset_child_count(idx, host)))
                edges.append({"source": sid, "target": aid, "relationship": "hosts", "confidence": 85})
        else:
            host = subnet_hosts[0]
            aid = f"asset:{host}"
            nodes.append(_asset_node(idx, host, child_count=_asset_child_count(idx, host)))
            edges.append({"source": cluster_id, "target": aid, "relationship": "affects", "confidence": 85})

    nodes = _apply_node_filters(nodes, idx, filters)
    return _response(
        level=2,
        parent_id=parent_id,
        idx=idx,
        nodes=nodes,
        edges=edges,
        breadcrumb=[
            {"id": "root", "label": "Investigations"},
            {"id": parent_id, "label": str(inv.get("title") or "Investigation")},
        ],
    )


def _asset_node(idx: _GraphIndex, host: str, *, child_count: int) -> dict[str, Any]:
    nid = idx.asset_node_id(host)
    raw = idx.nodes.get(nid or "", {})
    return {
        "id": f"asset:{host}",
        "label": host,
        "type": "asset",
        "level": 2,
        "expandable": True,
        "child_count": child_count,
        "risk": float(raw.get("risk") or _host_risk(idx, host)),
        "confidence": int(raw.get("confidence") or 70),
        "evidence": (raw.get("evidence") or [f"Host {host} in scope"])[:3],
        "finding_ids": raw.get("finding_ids") or [],
        "group": _subnet_key(host),
    }


def _host_risk(idx: _GraphIndex, host: str) -> float:
    nid = idx.asset_node_id(host)
    if nid and nid in idx.nodes:
        return float(idx.nodes[nid].get("risk") or 5.0)
    return 5.0


def _asset_child_count(idx: _GraphIndex, host: str) -> int:
    nid = idx.asset_node_id(host)
    if not nid:
        return 0
    return len(idx.neighborhood([nid], depth=2)) - 1


def _level_evidence(
    idx: _GraphIndex,
    inv: dict[str, Any] | None,
    parent_id: str,
    filters: dict[str, Any],
) -> dict[str, Any]:
    hosts = [str(h) for h in (inv or {}).get("affected_assets") or [] if h]
    if not hosts:
        return _level_evidence_asset(idx, parent_id, filters)
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    for host in hosts[:24]:
        part = _level_evidence_asset(idx, f"asset:{host}", filters, attach_edges=False)
        for n in part["nodes"]:
            if not any(x["id"] == n["id"] for x in nodes):
                nodes.append(n)
        for host_node in [n for n in part["nodes"] if n["type"] == "asset" or n["id"].startswith("asset:")]:
            edges.append({"source": parent_id, "target": host_node["id"], "relationship": "expands", "confidence": 80})
        edges.extend(part["edges"])
    nodes = _apply_node_filters(nodes, idx, filters)
    return _response(
        level=3,
        parent_id=parent_id,
        idx=idx,
        nodes=nodes,
        edges=edges,
        breadcrumb=[
            {"id": "root", "label": "Investigations"},
            {"id": parent_id, "label": str((inv or {}).get("title") or "Investigation")},
            {"id": f"{parent_id}:evidence", "label": "Evidence"},
        ],
    )


def _level_evidence_subnet(
    idx: _GraphIndex,
    investigations: list[dict[str, Any]],
    parent_id: str,
    filters: dict[str, Any],
) -> dict[str, Any]:
    subnet = parent_id.removeprefix("subnet:")
    inv = _investigation_for_subnet(investigations, parent_id)
    hosts = [
        str(h)
        for h in (inv.get("affected_assets") if inv else [])
        if h and _subnet_key(str(h)) == subnet
    ]
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    for host in hosts:
        part = _level_evidence_asset(idx, f"asset:{host}", filters, attach_edges=False)
        nodes.extend(part["nodes"])
        edges.extend(part["edges"])
    nodes = _dedupe_nodes(nodes)
    return _response(level=3, parent_id=parent_id, idx=idx, nodes=nodes, edges=edges, breadcrumb=[])


def _level_evidence_asset(
    idx: _GraphIndex,
    parent_id: str,
    filters: dict[str, Any],
    *,
    attach_edges: bool = True,
) -> dict[str, Any]:
    host = parent_id.removeprefix("asset:")
    root = idx.asset_node_id(host)
    if not root:
        root = parent_id if parent_id in idx.nodes else None
    reachable = idx.neighborhood([root] if root else [], depth=3) if root else set()

    service_buckets: dict[str, list[str]] = {}
    cve_buckets: dict[str, list[str]] = {}
    cloud_nodes: list[str] = []

    for nid in reachable:
        node = idx.nodes[nid]
        t = _node_type(node)
        if t == "service":
            key = _service_port_key(str(node.get("label") or ""), nid)
            service_buckets.setdefault(key, []).append(nid)
        elif t == "vulnerability":
            cve = _cve_from_node(node) or str(node.get("label") or nid)[:32]
            cve_buckets.setdefault(cve, []).append(nid)
        elif t in ("cloud", "container", "kubernetes") or _CLOUD_RE.search(str(node.get("label") or nid)):
            cloud_nodes.append(nid)

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    if attach_edges:
        nodes.append(
            {
                "id": parent_id,
                "label": host,
                "type": "asset",
                "level": 3,
                "expandable": True,
                "child_count": len(service_buckets) + len(cve_buckets) + len(cloud_nodes),
                "risk": _host_risk(idx, host),
            }
        )

    for key, members in service_buckets.items():
        if len(members) == 1 and attach_edges:
            n = idx.nodes[members[0]]
            nodes.append({**n, "id": members[0], "level": 3, "expandable": False})
            edges.append({"source": parent_id, "target": members[0], "relationship": "runs", "confidence": 80})
            continue
        gid = f"evidence:service:{host}:{key.replace('/', '_')}"
        max_risk = max(float(idx.nodes[m].get("risk") or 0) for m in members)
        nodes.append(
            {
                "id": gid,
                "label": f"{key} · {len(members)} services",
                "type": "service_cluster",
                "level": 3,
                "expandable": len(members) > 1,
                "child_count": len(members),
                "risk": max_risk,
                "evidence": [f"{len(members)} identical services collapsed"],
                "group": key,
            }
        )
        if attach_edges:
            edges.append({"source": parent_id, "target": gid, "relationship": "runs", "confidence": 80})

    for cve, members in cve_buckets.items():
        gid = f"evidence:cve:{cve}"
        max_risk = max(float(idx.nodes[m].get("risk") or 0) for m in members)
        nodes.append(
            {
                "id": gid,
                "label": f"{cve} · {len(members)} finding{'s' if len(members) != 1 else ''}",
                "type": "cve_cluster",
                "level": 3,
                "expandable": False,
                "child_count": len(members),
                "risk": max_risk,
                "evidence": [f"{len(members)} duplicate CVE nodes collapsed"],
                "group": cve,
            }
        )
        if attach_edges:
            edges.append({"source": parent_id, "target": gid, "relationship": "confirms_applicability", "confidence": 88})

    if cloud_nodes:
        gid = f"evidence:cloud:{host}"
        nodes.append(
            {
                "id": gid,
                "label": f"Cloud resources · {len(cloud_nodes)}",
                "type": "cloud_cluster",
                "level": 3,
                "expandable": True,
                "child_count": len(cloud_nodes),
                "risk": max(float(idx.nodes[m].get("risk") or 0) for m in cloud_nodes),
                "evidence": ["Cloud/container resources clustered"],
            }
        )
        if attach_edges:
            edges.append({"source": parent_id, "target": gid, "relationship": "hosts", "confidence": 75})

    nodes = _apply_node_filters(nodes, idx, filters)
    return _response(
        level=3,
        parent_id=parent_id,
        idx=idx,
        nodes=nodes,
        edges=edges,
        breadcrumb=[],
    )


def _level_attack_paths(
    idx: _GraphIndex,
    inv: dict[str, Any] | None,
    parent_id: str,
    graph: dict[str, Any],
    filters: dict[str, Any],
) -> dict[str, Any]:
    paths = graph.get("attack_paths") or []
    finding_ids = set(str(f) for f in (inv or {}).get("finding_ids") or [])
    host = ""
    if parent_id.startswith("asset:"):
        host = parent_id.removeprefix("asset:")

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    for i, path in enumerate(paths[:12]):
        steps = path.get("steps") or []
        if not steps and path.get("nodes"):
            steps = [str(n.get("label") or n.get("id") or "") for n in path["nodes"]]
        if not steps:
            continue

        path_hosts = " ".join(steps).lower()
        path_findings = set(str(f) for f in path.get("finding_ids") or [])
        if host:
            if host not in path_hosts:
                nid = idx.asset_node_id(host)
                asset_findings = set(
                    str(f) for f in (idx.nodes.get(nid or "", {}).get("finding_ids") or [])
                )
                if not path_findings.intersection(asset_findings) and not path_findings.intersection(finding_ids):
                    continue
        elif finding_ids and path_findings and not path_findings.intersection(finding_ids):
            continue

        pid = f"path:{path.get('stable_id') or path.get('id') or i}"
        title = path.get("title") or (f"{steps[0]} → {steps[-1]}" if len(steps) >= 2 else steps[0])
        nodes.append(
            {
                "id": pid,
                "label": str(title)[:80],
                "type": "attack_path",
                "level": 4,
                "expandable": False,
                "child_count": len(steps),
                "risk": float(path.get("risk") or path.get("risk_score") or 7),
                "confidence": int(path.get("confidence") or 0),
                "evidence": steps[:6],
                "group": str(path.get("category") or "attack_path"),
            }
        )
        edges.append(
            {
                "source": parent_id,
                "target": pid,
                "relationship": "enables",
                "confidence": int(path.get("confidence") or 70),
            }
        )

        # Path step chain (collapsed — only step endpoints, not full graph)
        prev = pid
        for j, step in enumerate(steps[:8]):
            sid = f"{pid}:step:{j}"
            nodes.append(
                {
                    "id": sid,
                    "label": str(step)[:64],
                    "type": "path_step",
                    "level": 4,
                    "expandable": False,
                    "risk": float(path.get("risk") or 5),
                    "confidence": int(path.get("confidence") or 0),
                }
            )
            edges.append({"source": prev, "target": sid, "relationship": "yields_access", "confidence": 75})
            prev = sid

    nodes = _apply_node_filters(nodes, idx, filters)
    return _response(
        level=4,
        parent_id=parent_id,
        idx=idx,
        nodes=nodes,
        edges=edges,
        breadcrumb=[
            {"id": "root", "label": "Investigations"},
            {"id": parent_id, "label": "Attack paths"},
        ],
    )


def _apply_node_filters(
    nodes: list[dict[str, Any]],
    idx: _GraphIndex,
    filters: dict[str, Any],
) -> list[dict[str, Any]]:
    if not filters:
        return nodes
    out: list[dict[str, Any]] = []
    for node in nodes:
        risk = float(node.get("risk") or 0)
        if filters.get("critical") and risk < 7:
            continue
        if filters.get("exploitable") and _node_type(node) not in ("vulnerability", "attack_path", "cve_cluster", "investigation_cluster"):
            if risk < 6:
                continue
        if filters.get("internet"):
            label = str(node.get("label") or "").lower()
            if "internet" not in label and "external" not in label and not str(node.get("id", "")).startswith("entry:"):
                ev = " ".join(str(e) for e in (node.get("evidence") or [])).lower()
                if "internet" not in ev and "external" not in ev:
                    continue
        out.append(node)
    return out


def _dedupe_nodes(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for n in nodes:
        nid = str(n.get("id") or "")
        if nid in seen:
            continue
        seen.add(nid)
        out.append(n)
    return out


def _response(
    *,
    level: int,
    parent_id: str | None,
    idx: _GraphIndex,
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    breadcrumb: list[dict[str, str]],
) -> dict[str, Any]:
    visible_nodes = len(nodes)
    visible_edges = len(edges)
    return {
        "level": level,
        "parent_id": parent_id,
        "nodes": nodes,
        "edges": edges,
        "breadcrumb": breadcrumb,
        "statistics": {
            "total_nodes": idx.total_nodes,
            "total_edges": idx.total_edges,
            "visible_nodes": visible_nodes,
            "visible_edges": visible_edges,
            "hidden_nodes": max(0, idx.total_nodes - visible_nodes),
            "hidden_edges": max(0, idx.total_edges - visible_edges),
        },
    }
