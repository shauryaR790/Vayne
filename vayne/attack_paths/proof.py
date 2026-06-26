"""Auditable proof log for graph construction and path discovery."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ProofNode(BaseModel):
    id: str
    label: str
    node_type: str
    evidence: list[str] = Field(default_factory=list)
    finding_ids: list[str] = Field(default_factory=list)


class ProofEdge(BaseModel):
    source: str
    target: str
    relationship: str
    evidence: str
    finding_id: str
    source_tool: str
    discovered_from: list[str] = Field(default_factory=list)
    artifact_type: str = ""
    confidence: int = 0
    validation_checks: list[str] = Field(default_factory=list)
    accepted: bool = True
    reject_reason: str = ""


class PathDiscoveryProof(BaseModel):
    algorithm: str = "networkx.all_simple_paths"
    entry_nodes: list[str] = Field(default_factory=list)
    terminal_nodes: list[str] = Field(default_factory=list)
    raw_paths_enumerated: int = 0
    paths_invalid_edges: int = 0
    paths_low_confidence: int = 0
    paths_no_validated_finding: int = 0
    paths_rejected: int = 0
    paths_accepted: int = 0
    rejected_path_reasons: list[str] = Field(default_factory=list)
    sample_raw_paths: list[str] = Field(default_factory=list)


class GraphStatistics(BaseModel):
    connected_components: int = 0
    average_degree: float = 0.0
    reachable_nodes: int = 0
    candidate_attack_paths: int = 0


class GraphProof(BaseModel):
    nodes: list[ProofNode] = Field(default_factory=list)
    edges: list[ProofEdge] = Field(default_factory=list)
    rejected_edges: list[ProofEdge] = Field(default_factory=list)
    path_discovery: PathDiscoveryProof | None = None
    discovered_assets: list[dict] = Field(default_factory=list)
    graph_statistics: GraphStatistics | None = None

    def log_lines(self) -> list[str]:
        lines = [
            "=== VAYNE PROOF MODE ===",
            f"Nodes discovered: {len(self.nodes)}",
            f"Edges created: {sum(1 for e in self.edges if e.accepted)}",
            f"Edges rejected: {len(self.rejected_edges)}",
        ]
        for n in self.nodes:
            lines.append(
                f"NODE [{n.node_type}] {n.label} "
                f"(findings: {', '.join(n.finding_ids) or 'n/a'})"
            )
            for ev in n.evidence[:2]:
                lines.append(f"  evidence: {ev[:120]}")
        for e in self.edges:
            if not e.accepted:
                continue
            lines.append(f"EDGE {e.source} -> {e.target} [{e.relationship}]")
            lines.append(f"  DISCOVERED FROM ({e.source_tool}, finding {e.finding_id}):")
            for d in e.discovered_from:
                lines.append(f"    - {d}")
            if e.artifact_type:
                lines.append(f"  artifact_type: {e.artifact_type}")
            lines.append(f"  evidence: {e.evidence[:160]}")
            lines.append(f"  confidence: {e.confidence}%")
            lines.append(f"  validation: {', '.join(e.validation_checks)}")
        for e in self.rejected_edges:
            lines.append(f"REJECTED EDGE {e.source} -> {e.target}: {e.reject_reason}")
        if self.path_discovery:
            pd = self.path_discovery
            lines.extend([
                "",
                "=== PATH DISCOVERY ===",
                f"Algorithm: {pd.algorithm}",
                f"Entry nodes: {', '.join(pd.entry_nodes)}",
                f"Terminal nodes: {', '.join(pd.terminal_nodes)}",
                f"Running {pd.algorithm}()...",
                f"Found: {pd.raw_paths_enumerated} possible paths",
                f"Filtered (invalid edges): {pd.paths_invalid_edges}",
                f"Filtered (low confidence): {pd.paths_low_confidence}",
                f"Filtered (no validated finding): {pd.paths_no_validated_finding}",
                f"Paths explored: {pd.raw_paths_enumerated}",
                f"Paths rejected: {pd.paths_rejected}",
                f"Valid attack paths: {pd.paths_accepted}",
            ])
            for reason in pd.rejected_path_reasons[:12]:
                lines.append(f"  REJECTED PATH: {reason}")
            for p in pd.sample_raw_paths[:5]:
                lines.append(f"  sample path: {p}")
        if self.graph_statistics:
            gs = self.graph_statistics
            lines.extend([
                "",
                "=== GRAPH STATISTICS ===",
                f"Connected components: {gs.connected_components}",
                f"Average degree: {gs.average_degree}",
                f"Reachable nodes: {gs.reachable_nodes}",
                f"Candidate attack paths: {gs.candidate_attack_paths}",
            ])
        lines.extend([
            "",
            "=== SUMMARY ===",
            f"Nodes discovered: {len(self.nodes)}",
            f"Edges discovered: {sum(1 for e in self.edges if e.accepted)}",
            f"Edges rejected: {len(self.rejected_edges)}",
        ])
        if self.path_discovery:
            pd = self.path_discovery
            lines.extend([
                f"Paths explored: {pd.raw_paths_enumerated}",
                f"Paths rejected: {pd.paths_rejected}",
                f"Valid attack paths: {pd.paths_accepted}",
            ])
        return lines