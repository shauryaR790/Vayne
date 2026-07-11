"""Typed Evidence Graph (Priority 5).

Findings are not evaluated in isolation — each retained finding is expressed as
a typed graph that can be *walked* to reconstruct the conclusion:

    Host → Port → Service → Version → CVE → Exploit → Reachability → Finding

Node types:   host, port, service, version, banner, certificate, cve, exploit,
              credential, validation, scanner_evidence, attack_step, asset
Relationships: contains, runs, confirmed_by, contradicted_by, supports,
              depends_on, reachable_from, requires, associated_with

The graph is the source of truth: ``reconstruct(finding_id)`` returns the exact
ordered chain of nodes that justifies a finding.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from vayne.correlator.normalization import CVE_RE
from vayne.evidence.quality import classify_evidence
from vayne.models import CorrelatedFinding, ValidationResult


@dataclass
class GNode:
    id: str
    type: str
    label: str
    attrs: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {"id": self.id, "type": self.type, "label": self.label, **self.attrs}


@dataclass
class GEdge:
    source: str
    target: str
    relationship: str

    def as_dict(self) -> dict[str, Any]:
        return {"source": self.source, "target": self.target, "relationship": self.relationship}


class EvidenceGraph:
    def __init__(self) -> None:
        self._nodes: dict[str, GNode] = {}
        self._edges: list[GEdge] = []
        self._edge_keys: set[tuple[str, str, str]] = set()
        # finding_id -> ordered node ids forming its reconstruction chain
        self._chains: dict[str, list[str]] = {}

    def _add_node(self, node: GNode) -> str:
        if node.id not in self._nodes:
            self._nodes[node.id] = node
        return node.id

    def _add_edge(self, source: str, target: str, relationship: str) -> None:
        key = (source, target, relationship)
        if key in self._edge_keys:
            return
        self._edge_keys.add(key)
        self._edges.append(GEdge(source, target, relationship))

    def add_finding(
        self, finding: CorrelatedFinding, validation: ValidationResult
    ) -> list[str]:
        entity = finding.canonical_entity
        host = finding.host or "unknown-host"
        chain: list[str] = []

        host_id = self._add_node(GNode(f"host:{host}", "host", host))
        chain.append(host_id)

        port_id = host_id
        if finding.port:
            port_id = self._add_node(
                GNode(f"port:{host}:{finding.port}", "port", f"{finding.port}/tcp")
            )
            self._add_edge(host_id, port_id, "contains")
            chain.append(port_id)

        svc_label = (entity.product or entity.service) if entity else finding.service
        svc_label = svc_label or finding.title
        svc_id = self._add_node(
            GNode(f"service:{host}:{finding.port or 0}:{svc_label}", "service", svc_label,
                  {"kind": entity.kind if entity else "service"})
        )
        self._add_edge(port_id, svc_id, "runs")
        chain.append(svc_id)

        version = entity.version if entity else ""
        if version:
            ver_id = self._add_node(
                GNode(f"version:{svc_id}:{version}", "version", version,
                      {"agreed": bool(finding.version_agreement.agreed) if finding.version_agreement else True})
            )
            self._add_edge(svc_id, ver_id, "associated_with")
            chain.append(ver_id)
            anchor = ver_id
        else:
            anchor = svc_id

        # Banner node from the strongest banner-type evidence.
        for f in finding.findings:
            if f.evidence and any(k in (f.evidence.lower()) for k in ("server:", "banner", "<title>")):
                ban_id = self._add_node(
                    GNode(f"banner:{f.id}", "banner", f.evidence[:80],
                          {"source_tool": f.source_tool})
                )
                self._add_edge(svc_id, ban_id, "supports")
                break

        # CVE + exploit.
        cves = CVE_RE.findall(f"{finding.title} {finding.cve} {' '.join(finding.evidence)}")
        cve = (finding.cve or (cves[0] if cves else "")).upper()
        if cve:
            cve_id = self._add_node(
                GNode(f"cve:{cve}", "cve", cve, {"applicable": validation.cve_applicable})
            )
            self._add_edge(anchor, cve_id, "associated_with")
            chain.append(cve_id)
            anchor = cve_id
            if validation.cve_applicable:
                exp_id = self._add_node(
                    GNode(f"exploit:{cve}", "exploit", f"Exploit for {cve}",
                          {"confirmed": validation.reproducible})
                )
                self._add_edge(cve_id, exp_id, "requires")
                chain.append(exp_id)
                anchor = exp_id

        # Scanner evidence nodes with confirm/contradict edges.
        for f in finding.findings:
            q = classify_evidence(f)
            ev_id = self._add_node(
                GNode(
                    f"evidence:{f.id}", "scanner_evidence",
                    f"{f.source_tool}: {q.evidence_type}",
                    {
                        "source_tool": f.source_tool,
                        "reliability": round(q.reliability, 3),
                        "reliability_tier": q.reliability_tier,
                        "spoofability": q.spoofability,
                    },
                )
            )
            self._add_edge(ev_id, svc_id, "confirmed_by")
        for conflict in finding.conflicts or []:
            cf_id = self._add_node(
                GNode(f"conflict:{finding.id}:{conflict.kind}", "validation",
                      f"conflict: {conflict.kind}", {"detail": conflict.detail})
            )
            self._add_edge(cf_id, svc_id, "contradicted_by")

        # Reachability.
        if validation.reachable:
            reach_id = self._add_node(GNode("net:internet", "asset", "Internet entry point"))
            self._add_edge(svc_id, reach_id, "reachable_from")
            chain.append(reach_id)

        # Validation + Finding terminal node.
        val_id = self._add_node(
            GNode(f"validation:{finding.id}", "validation",
                  str(validation.classification),
                  {"overall_confidence": validation.overall_confidence})
        )
        self._add_edge(val_id, anchor, "supports")
        find_id = self._add_node(
            GNode(f"finding:{finding.id}", "finding", finding.title,
                  {"classification": str(validation.classification),
                   "overall_confidence": validation.overall_confidence})
        )
        self._add_edge(find_id, val_id, "depends_on")
        self._add_edge(find_id, anchor, "depends_on")
        chain.append(find_id)

        self._chains[finding.id] = chain
        return chain

    def reconstruct(self, finding_id: str) -> list[dict[str, Any]]:
        """Walk the chain of nodes that justify a finding, in order."""
        return [self._nodes[nid].as_dict() for nid in self._chains.get(finding_id, []) if nid in self._nodes]

    def as_dict(self) -> dict[str, Any]:
        return {
            "nodes": [n.as_dict() for n in self._nodes.values()],
            "edges": [e.as_dict() for e in self._edges],
            "chains": {fid: self.reconstruct(fid) for fid in self._chains},
            "stats": {
                "node_count": len(self._nodes),
                "edge_count": len(self._edges),
                "finding_count": len(self._chains),
            },
        }


def build_evidence_graph(
    findings: list[tuple[CorrelatedFinding, ValidationResult]]
) -> EvidenceGraph:
    graph = EvidenceGraph()
    for correlated, validation in findings:
        graph.add_finding(correlated, validation)
    return graph
