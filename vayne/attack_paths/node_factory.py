"""Node factory — single, typed entry point for building attack-graph nodes.

Centralizes node creation so new node types (Phase 2+) never require editing the
graph builder's core traversal logic. Every node produced here satisfies the
GraphNode contract (evidence, finding_ids, confidence, blast_radius, capability,
criticality, source_tool, validation_status) and may carry arbitrary additional
evidence-derived attributes via **extra.
"""

from __future__ import annotations

from vayne.attack_paths.asset_criticality import classify_criticality
from vayne.models import GraphNode

REQUIRED_NODE_FIELDS = (
    "label",
    "node_type",
    "evidence",
    "finding_ids",
    "confidence",
    "blast_radius",
    "capability",
    "criticality",
    "source_tool",
    "validation_status",
    "evidence_tier",
)


def build_node_attrs(
    node_id: str,
    *,
    label: str,
    node_type: str,
    evidence: list[str] | None = None,
    finding_ids: list[str] | None = None,
    confidence: int = 0,
    capability: str = "",
    source_tool: str = "scan",
    validation_status: str = "observed",
    evidence_tier: str = "TIER1",
    blast_radius: int = 0,
    criticality: str | None = None,
    criticality_weight: float | None = None,
    **extra,
) -> dict:
    """Return a flat networkx attribute dict for a single graph node.

    Criticality is derived deterministically from node data when not supplied.
    `extra` carries specialized, evidence-backed attributes (cvss,
    applicability_status, is_entry, vendor, port, ...) that downstream stages read.
    """
    evidence = list(evidence or [])
    finding_ids = list(finding_ids or [])

    if criticality is None or criticality_weight is None:
        cat, weight = classify_criticality(
            node_id,
            {"node_type": node_type, "label": label, "evidence": evidence},
        )
        criticality = criticality if criticality is not None else cat
        criticality_weight = (
            criticality_weight if criticality_weight is not None else weight
        )

    node = GraphNode(
        label=label,
        node_type=node_type,
        evidence=evidence,
        finding_ids=finding_ids,
        confidence=confidence,
        blast_radius=blast_radius,
        capability=capability,
        criticality=criticality,
        criticality_weight=criticality_weight,
        source_tool=source_tool,
        validation_status=validation_status,
        evidence_tier=evidence_tier,
    )
    attrs = node.model_dump()
    attrs.update(extra)
    return attrs


def ensure_node_fields(attrs: dict) -> dict:
    """Backfill any missing required field on an existing node attribute dict."""
    defaults = {
        "evidence": [],
        "finding_ids": [],
        "confidence": 0,
        "blast_radius": 0,
        "capability": "",
        "criticality": "",
        "source_tool": "scan",
        "validation_status": "observed",
        "evidence_tier": "TIER1",
    }
    for key, default in defaults.items():
        attrs.setdefault(key, default)
    return attrs
