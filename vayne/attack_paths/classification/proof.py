"""Attack category proof object (Phase H)."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AttackCategoryProof:
    category: str
    matched_rules: list[str] = field(default_factory=list)
    matched_nodes: list[str] = field(default_factory=list)
    matched_capabilities: list[str] = field(default_factory=list)
    matched_edges: list[str] = field(default_factory=list)
    confidence: int = 0
    explanation: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "category": self.category,
            "matched_rules": list(self.matched_rules),
            "matched_nodes": list(self.matched_nodes),
            "matched_capabilities": list(self.matched_capabilities),
            "matched_edges": list(self.matched_edges),
            "confidence": self.confidence,
            "explanation": list(self.explanation),
        }
