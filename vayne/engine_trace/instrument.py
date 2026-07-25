"""Helpers that turn real engine state into Engine Trace events."""

from __future__ import annotations

from typing import Any

from vayne.engine_trace.emitter import EngineTraceEmitter
from vayne.engine_trace.events import (
    STAGE_AI,
    STAGE_CONFIDENCE,
    STAGE_CORRELATION,
    STAGE_DEDUPLICATION,
    STAGE_EXPORT,
    STAGE_GRAPH,
    STAGE_INVESTIGATION,
    STAGE_NORMALIZATION,
    STAGE_PARSER,
    STAGE_PRIORITY,
    STAGE_SUMMARY,
    STAGE_VALIDATION,
)
from vayne.investigation.quality_score import composite_priority_score
from vayne.models import Classification


PRIORITY_WEIGHTS = {
    "business_impact": 0.18,
    "exploitability": 0.16,
    "internet_exposure": 0.12,
    "confidence": 0.14,
    "blast_radius": 0.10,
    "data_sensitivity": 0.10,
    "identity_exposure": 0.08,
    "investigation_completeness": 0.12,
}


def emit_parser_complete(
    emitter: EngineTraceEmitter,
    *,
    paths: list[str],
    raw_findings: int,
    raw_assets: int,
    manifest: dict[str, Any] | None,
    execution_ms: float,
    hosts: int | None = None,
    ports: int | None = None,
    services: int | None = None,
) -> None:
    host_set: set[Any] = set()
    files = []
    if manifest:
        for row in manifest.get("files") or []:
            if isinstance(row, dict):
                files.append(row.get("name") or row.get("path") or "file")
                if row.get("hosts") is not None:
                    host_set.update(row.get("hosts") if isinstance(row.get("hosts"), list) else [])
        files = files or list(manifest.get("filenames") or [])
    emitter.emit_stage(
        STAGE_PARSER,
        "complete",
        message="Scanner artifacts parsed",
        execution_ms=round(execution_ms, 3),
        fields={
            "files": files or paths,
            "files_processed": len(paths),
            "raw_findings": raw_findings,
            "raw_assets": raw_assets,
            "cache_hits": (manifest or {}).get("cache_hits", 0),
            "cache_misses": (manifest or {}).get("cache_misses", 0),
            "hosts": hosts if hosts is not None else (len(host_set) if host_set else None),
            "ports": ports,
            "services": services,
        },
    )


def emit_normalization(
    emitter: EngineTraceEmitter,
    *,
    raw_findings: int,
    execution_ms: float,
) -> None:
    emitter.emit_stage(
        STAGE_NORMALIZATION,
        "complete",
        message="Mapped findings into unified schema",
        execution_ms=round(execution_ms, 3),
        fields={
            "mapped_findings": raw_findings,
            "schema": "unified",
            "uuid_assigned": True,
            "service_canonicalization": True,
            "version_parsing": True,
        },
    )


def emit_correlation(
    emitter: EngineTraceEmitter,
    *,
    raw_findings: int,
    correlated: list,
    assets: list,
    execution_ms: float,
) -> None:
    duplicates_removed = max(0, raw_findings - len(correlated))
    emitter.emit_stage(
        STAGE_DEDUPLICATION,
        "complete",
        message="Duplicate signals collapsed",
        execution_ms=round(execution_ms, 3),
        fields={
            "raw_findings": raw_findings,
            "unique_findings": len(correlated),
            "duplicates_removed": duplicates_removed,
        },
    )

    # Emit concrete merge examples from real correlated entities.
    samples = []
    for item in correlated[:40]:
        sources = list(getattr(item, "source_tools", None) or getattr(item, "sources", None) or [])
        if not sources and getattr(item, "source_tool", None):
            sources = [item.source_tool]
        member_findings = list(getattr(item, "findings", None) or [])
        merged_ids = [f.id for f in member_findings if getattr(f, "id", None)]
        samples.append(
            {
                "finding_id": item.id,
                "title": item.title,
                "host": item.host,
                "service": getattr(item, "service", None) or getattr(item, "product", None),
                "version": getattr(item, "version", None),
                "cve": getattr(item, "cve", None),
                "sources": sources,
                "merged_findings": merged_ids[:12],
                "evidence_count": len(getattr(item, "evidence", None) or []),
                "evidence_ids": list(getattr(item, "evidence_ids", None) or [])[:12],
                "scanner_agreement": (
                    getattr(item.scanner_agreement, "ratio", None)
                    if getattr(item, "scanner_agreement", None)
                    else None
                ),
                "scanner_agreement_label": (
                    getattr(item.scanner_agreement, "label", None)
                    if getattr(item, "scanner_agreement", None)
                    else None
                ),
            }
        )

    emitter.emit_stage(
        STAGE_CORRELATION,
        "complete",
        message="Cross-scanner correlation finished",
        execution_ms=round(execution_ms, 3),
        fields={
            "correlated_findings": len(correlated),
            "assets": len(assets),
            "samples": samples,
        },
    )


def emit_validation(
    emitter: EngineTraceEmitter,
    *,
    validations: list,
    correlated: list,
    execution_ms: float,
) -> None:
    by_class: dict[str, int] = {}
    for v in validations:
        key = str(getattr(v.classification, "value", v.classification))
        by_class[key] = by_class.get(key, 0) + 1

    fp = by_class.get(Classification.FALSE_POSITIVE.value, by_class.get("false_positive", 0))
    retained = len(correlated) - fp

    emitter.emit_stage(
        STAGE_VALIDATION,
        "complete",
        message="Finding validation finished",
        execution_ms=round(execution_ms, 3),
        fields={
            "validated": len(validations),
            "retained": retained,
            "false_positives": fp,
            "classification_counts": by_class,
        },
    )

    # Confidence transparency — real factor vectors from top findings.
    ranked = sorted(
        zip(correlated, validations),
        key=lambda pair: int(getattr(pair[1], "overall_confidence", 0) or 0),
        reverse=True,
    )
    for item, validation in ranked[:40]:
        factors = getattr(validation, "confidence_factors", None) or {}
        overall = float(getattr(validation, "overall_confidence", 0) or 0)
        if not factors:
            # Still emit the score even without a factor vector.
            emitter.emit_stage(
                STAGE_CONFIDENCE,
                "score",
                message=f"Confidence for {item.title}",
                fields={
                    "finding_id": item.id,
                    "host": item.host,
                    "title": item.title,
                    "overall_confidence": overall,
                    "observation": getattr(validation, "observation_confidence", None),
                    "exploit": getattr(validation, "exploit_confidence", None),
                    "impact": getattr(validation, "impact_confidence", None),
                    "reliability": getattr(validation, "reliability_confidence", None),
                    "confidence_breakdown": list(getattr(validation, "confidence_breakdown", None) or [])[:12],
                },
            )
            continue
        # Flatten factor contributions for the formula panel.
        contributions = []
        total = 0.0
        for dim, rows in factors.items():
            if not isinstance(rows, list):
                continue
            for row in rows[:8]:
                if not isinstance(row, dict):
                    continue
                delta = float(row.get("delta") or row.get("weight") or 0)
                contributions.append(
                    {
                        "dimension": dim,
                        "label": row.get("label") or row.get("feature") or dim,
                        "delta": delta,
                    }
                )
                total += delta
        emitter.emit_stage(
            STAGE_CONFIDENCE,
            "score",
            message=f"Confidence for {item.title}",
            fields={
                "finding_id": item.id,
                "host": item.host,
                "title": item.title,
                "overall_confidence": overall,
                "observation": getattr(validation, "observation_confidence", None),
                "exploit": getattr(validation, "exploit_confidence", None),
                "impact": getattr(validation, "impact_confidence", None),
                "reliability": getattr(validation, "reliability_confidence", None),
            },
            formula={
                "name": "finding_confidence",
                "result": overall / 100.0 if overall > 1 else overall,
                "result_pct": overall,
                "contributions": contributions,
                "sum_deltas": round(total, 4),
            },
        )


def emit_graph(
    emitter: EngineTraceEmitter,
    *,
    graph_proof: Any,
    attack_paths: list,
    execution_ms: float,
) -> None:
    accepted_edges = sum(1 for e in graph_proof.edges if getattr(e, "accepted", True))
    rejected_edges = len(getattr(graph_proof, "rejected_edges", []) or [])
    nodes = len(graph_proof.nodes)
    pd = graph_proof.path_discovery
    density = None
    avg_degree = None
    if nodes > 1 and accepted_edges >= 0:
        max_edges = nodes * (nodes - 1)
        density = round(accepted_edges / max_edges, 6) if max_edges else 0.0
        avg_degree = round((2 * accepted_edges) / nodes, 4) if nodes else 0.0

    fields: dict[str, Any] = {
        "nodes": nodes,
        "edges": accepted_edges,
        "rejected_edges": rejected_edges,
        "attack_paths": len(attack_paths),
        "graph_density": density,
        "average_degree": avg_degree,
    }
    if pd:
        fields.update(
            {
                "algorithm": getattr(pd, "algorithm", None),
                "paths_enumerated": getattr(pd, "raw_paths_enumerated", None),
                "paths_rejected": getattr(pd, "paths_rejected", None),
                "paths_accepted": getattr(pd, "paths_accepted", None),
                "entry_nodes": list(getattr(pd, "entry_nodes", []) or [])[:20],
                "terminal_nodes": list(getattr(pd, "terminal_nodes", []) or [])[:20],
                "analyst_minutes_saved": getattr(pd, "analyst_minutes_saved", None),
            }
        )

    emitter.emit_stage(
        STAGE_GRAPH,
        "complete",
        message="Attack graph constructed",
        execution_ms=round(execution_ms, 3),
        fields=fields,
    )

    for path in attack_paths[:8]:
        emitter.emit_stage(
            STAGE_GRAPH,
            "path",
            message=path.title,
            fields={
                "title": path.title,
                "risk_score": path.risk_score,
                "confidence": path.confidence,
                "attacker_effort": path.attacker_effort,
                "nodes": [n.id for n in (path.nodes or [])][:24],
                "is_hypothetical": bool(getattr(path, "is_hypothetical", False)),
            },
        )


def emit_priority_samples(
    emitter: EngineTraceEmitter,
    *,
    investigated: list,
) -> float | None:
    """Emit priority formula using real quality dimensions when present.

    Returns the highest priority observed (or None if none computed).
    """
    samples = []
    for item in investigated:
        intel = item.intelligence or {}
        quality = intel.get("quality_score") or intel.get("quality") or {}
        if not isinstance(quality, dict) or not quality:
            continue
        # Normalize keys to ints
        q = {k: int(v) for k, v in quality.items() if isinstance(v, (int, float))}
        if not q:
            continue
        priority = composite_priority_score(q)
        contributions = [
            {
                "label": key,
                "value": q.get(key, 0),
                "weight": weight,
                "weighted": round(q.get(key, 0) * weight, 4),
            }
            for key, weight in PRIORITY_WEIGHTS.items()
        ]
        samples.append((priority, item, q, contributions))

    samples.sort(key=lambda row: row[0], reverse=True)
    for priority, item, q, contributions in samples[:25]:
        emitter.emit_stage(
            STAGE_PRIORITY,
            "score",
            message=f"Priority for {item.correlated.title}",
            fields={
                "finding_id": item.correlated.id,
                "host": item.correlated.host,
                "title": item.correlated.title,
                "priority": priority,
                "quality": q,
            },
            formula={
                "name": "composite_priority_score",
                "result": priority,
                "expression": (
                    "Priority = Σ (dimension × weight) "
                    "clipped to [0, 99]"
                ),
                "weights": PRIORITY_WEIGHTS,
                "contributions": contributions,
            },
        )
    return float(samples[0][0]) if samples else None


def emit_investigation_build(
    emitter: EngineTraceEmitter,
    *,
    investigated: int,
    full_investigations: int,
    execution_ms: float,
) -> None:
    emitter.emit_stage(
        STAGE_INVESTIGATION,
        "complete",
        message="Per-finding investigations generated",
        execution_ms=round(execution_ms, 3),
        fields={
            "investigations_generated": investigated,
            "full_investigations": full_investigations,
        },
    )


def emit_export(
    emitter: EngineTraceEmitter,
    *,
    export_dir: str,
    execution_ms: float,
) -> None:
    emitter.emit_stage(
        STAGE_EXPORT,
        "complete",
        message="Production artifacts written",
        execution_ms=round(execution_ms, 3),
        fields={"export_dir": export_dir},
    )


def emit_summary(
    emitter: EngineTraceEmitter,
    *,
    duration_seconds: float,
    raw_findings: int,
    correlated: int,
    duplicates_removed: int,
    validations_retained: int,
    attack_paths: int,
    nodes: int,
    edges: int,
    investigations: int,
    avg_confidence: float | None,
    highest_priority: float | None,
    files_processed: int,
    assets: int,
) -> None:
    emitter.emit_stage(
        STAGE_SUMMARY,
        "deterministic_complete",
        message="Deterministic Investigation Complete",
        execution_ms=round(duration_seconds * 1000, 3),
        fields={
            "execution_time_s": round(duration_seconds, 3),
            "files_processed": files_processed,
            "hosts_assets": assets,
            "raw_findings": raw_findings,
            "normalized_findings": correlated,
            "duplicates_removed": duplicates_removed,
            "retained_findings": validations_retained,
            "investigations_generated": investigations,
            "attack_graph_nodes": nodes,
            "attack_graph_edges": edges,
            "attack_paths": attack_paths,
            "average_confidence": avg_confidence,
            "highest_priority": highest_priority,
        },
    )


def emit_ai_boundary(
    emitter: EngineTraceEmitter,
    *,
    deterministic_ms: float,
    investigations: int,
    avg_confidence: float | None,
) -> None:
    """Mark the hard boundary between deterministic engine and optional AI.

    AI explanation is not invoked inside the orchestrator. This event makes that
    separation explicit in the Engine Trace audit trail.
    """
    emitter.emit_stage(
        STAGE_AI,
        "boundary",
        message="Deterministic Investigation Complete — AI explanation is separate",
        fields={
            "ai_invoked_in_engine": False,
            "deterministic_execution_ms": round(deterministic_ms, 3),
            "investigations": investigations,
            "average_confidence": avg_confidence,
            "note": (
                "All preceding stages are deterministic computation. "
                "LLM narration, if used, runs after this boundary and does not "
                "alter engine scores, graphs, or priorities."
            ),
        },
    )
