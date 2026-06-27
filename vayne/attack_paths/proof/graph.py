"""Auditable proof log for graph construction and path discovery.

(Previously `vayne/attack_paths/proof.py`; moved into the `proof` package in
Phase G so acceptance/rejection/revival/alternatives proofs can live alongside
it. Re-exported from `vayne.attack_paths.proof` for backward compatibility.)
"""

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
    evidence_tier: str = "TIER1"
    evidence_type: str = ""
    evidence_source: str = ""
    accepted: bool = True
    reject_reason: str = ""
    confidence_proof: dict = Field(default_factory=dict)


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
    paths_hypothetical: int = 0
    rejected_path_reasons: list[str] = Field(default_factory=list)
    accepted_path_explanations: list[str] = Field(default_factory=list)
    sample_raw_paths: list[str] = Field(default_factory=list)
    false_positives_eliminated: int = 0
    analyst_minutes_saved: float = 0.0
    confidence_distribution: dict[str, int] = Field(default_factory=dict)
    unknowns_requiring_investigation: int = 0
    max_blast_radius: int = 0
    # Phase D search telemetry (additive; not rendered in log_lines so existing
    # proof output is unchanged). Populated when beam search is used.
    search_states_expanded: int = 0
    search_branches_pruned: int = 0
    search_prune_reasons: dict[str, int] = Field(default_factory=dict)
    # Phase G: structured rejection proofs (additive; not rendered in log_lines).
    rejected_path_proofs: list[dict] = Field(default_factory=list)
    # Phase H: attack category classifications (additive section in log_lines).
    path_classifications: list[dict] = Field(default_factory=list)


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
            lines.append(f"  Evidence: {e.evidence[:160]}")
            lines.append(f"  Tool: {e.source_tool}")
            lines.append(f"  Artifact: {e.artifact_type or 'n/a'}")
            lines.append(f"  Tier: {e.evidence_tier}")
            lines.append(f"  Confidence: {e.confidence}%")
            lines.append(f"  Validation: {', '.join(e.validation_checks)}")
            lines.append(f"  DISCOVERED FROM (finding {e.finding_id}):")
            for d in e.discovered_from:
                lines.append(f"    - {d}")
        for e in self.rejected_edges:
            lines.append(f"REJECTED EDGE {e.source} -> {e.target}: {e.reject_reason}")
        if self.path_discovery:
            pd = self.path_discovery
            lines.extend([
                "",
                "=== PATH DISCOVERY ===",
                f"Algorithm: {pd.algorithm}",
                f"Entry nodes: {', '.join(pd.entry_nodes)}",
                f"Terminal nodes: {', '.join(pd.terminal_nodes) or 'none (high-value targets required)'}",
                f"Paths explored: {pd.raw_paths_enumerated}",
                f"Paths rejected: {pd.paths_rejected}",
                f"Paths surviving: {pd.paths_accepted}",
                f"Hypothetical paths: {pd.paths_hypothetical}",
                f"False positives eliminated: {pd.false_positives_eliminated}",
                f"Manual analyst minutes saved: {pd.analyst_minutes_saved}",
                f"Unknowns requiring investigation: {pd.unknowns_requiring_investigation}",
                f"Max blast radius (single node): {pd.max_blast_radius}",
            ])
            if pd.confidence_distribution:
                dist = ", ".join(f"{k}={v}" for k, v in pd.confidence_distribution.items())
                lines.append(f"Confidence distribution: {dist}")
            for reason in pd.rejected_path_reasons[:12]:
                lines.append(f"  {reason}")
            for expl in pd.accepted_path_explanations[:5]:
                for line in expl.split("\n"):
                    lines.append(f"  {line}")
            for p in pd.sample_raw_paths[:5]:
                lines.append(f"  sample path: {p}")
            if pd.path_classifications:
                lines.extend(["", "=== ATTACK CATEGORY CLASSIFICATION ==="])
                for pc in pd.path_classifications[:8]:
                    lines.append(f"ATTACK CATEGORY: {pc.get('attack_category', 'unknown').upper()}")
                    proof = pc.get("proof") or {}
                    for expl in proof.get("explanation", [])[:4]:
                        lines.append(f"  WHY THIS CATEGORY: {expl}")
                    for cap in proof.get("matched_capabilities", [])[:6]:
                        lines.append(f"  MATCHED CAPABILITY: {cap}")
                    for node in proof.get("matched_nodes", [])[:6]:
                        lines.append(f"  MATCHED NODE: {node}")
                    for rule in proof.get("matched_rules", [])[:4]:
                        lines.append(f"  MATCHED RULE: {rule}")
                    for edge in proof.get("matched_edges", [])[:4]:
                        lines.append(f"  MATCHED EDGE: {edge}")
                    for tac in pc.get("mitre_tactics", [])[:6]:
                        lines.append(f"  MITRE TACTIC: {tac}")
                    for tech in pc.get("mitre_techniques", [])[:6]:
                        lines.append(f"  MITRE TECHNIQUE: {tech}")
                    lines.append("")
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
                f"Analyst minutes saved: {pd.analyst_minutes_saved}",
            ])
        return lines
