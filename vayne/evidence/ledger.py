"""Evidence ledger — traceable file contributions per conclusion.

Answers: which scan files contributed evidence to each retained finding,
what each file reported, and what conclusion the engine drew.
"""

from __future__ import annotations

from typing import Any

from vayne.models import CorrelatedFinding, InvestigatedFinding


_CONFLICT_ACTIONS = {
    "severity": "Normalize severity across scanners before prioritizing remediation.",
    "version": "Replay service fingerprint to establish authoritative version.",
    "reachability": "Re-test reachability from a consistent vantage point.",
    "port_state": "Re-probe port state to resolve open/filtered disagreement.",
    "service_identity": "Run targeted service probe to disambiguate identity.",
    "host": "Confirm host identity and DNS/IP mapping.",
}


def build_evidence_ledger(
    investigated: list[InvestigatedFinding],
) -> dict[str, Any]:
    """Build the full evidence ledger for an investigation."""
    entries: list[dict[str, Any]] = []

    for item in investigated:
        corr = item.correlated
        validation = item.validation
        entry = _ledger_entry(corr, validation, item.intelligence or {})
        entries.append(entry)

    file_index: dict[str, list[str]] = {}
    for entry in entries:
        for sf in entry.get("source_files") or []:
            file_index.setdefault(sf, []).append(entry["finding_id"])

    return {
        "entries": entries,
        "file_index": [
            {"file": fname, "finding_ids": ids, "count": len(ids)}
            for fname, ids in sorted(file_index.items())
        ],
        "total_findings": len(entries),
        "total_source_files": len(file_index),
    }


def _ledger_entry(
    corr: CorrelatedFinding,
    validation: Any,
    intelligence: dict[str, Any],
) -> dict[str, Any]:
    contributions: list[dict[str, Any]] = []
    by_file: dict[str, list[dict[str, Any]]] = {}

    for raw in corr.findings or []:
        sf = (raw.source_file or "unknown").strip() or "unknown"
        row = {
            "finding_id": raw.id,
            "source_file": sf,
            "source_tool": raw.source_tool,
            "severity": raw.severity,
            "title": raw.title,
            "evidence": (raw.evidence or raw.description or "")[:240],
            "cve": raw.cve or "",
        }
        contributions.append(row)
        by_file.setdefault(sf, []).append(row)

    classification = str(getattr(validation.classification, "value", validation.classification) or "")
    exploit_confirmed = str(getattr(validation, "exploitability_status", "") or "") == "confirmed"
    claim = "confirmed" if exploit_confirmed else classification.lower().replace(" ", "_")

    conflicts = []
    for c in corr.conflicts or []:
        conflicts.append(
            {
                "kind": c.kind,
                "detail": c.detail,
                "statements": c.statements[:6],
                "confidence_impact": int(c.confidence_impact or 0),
                "suggested_action": c.suggested_action
                or _CONFLICT_ACTIONS.get(c.kind, "Resolve scanner disagreement."),
            }
        )

    notebook = (intelligence.get("investigation") or {}).get("structured_notebook") or {}
    source_files = sorted(
        {
            *(corr.source_files or []),
            *(raw.source_file for raw in (corr.findings or []) if raw.source_file),
        }
    )

    return {
        "finding_id": corr.id,
        "title": corr.title,
        "host": corr.host,
        "cve": corr.cve or "",
        "classification": classification,
        "claim_status": claim,
        "confidence": int(getattr(validation, "overall_confidence", 0) or corr.confidence or 0),
        "sources": corr.sources or [],
        "source_files": source_files,
        "contributions": contributions,
        "contributions_by_file": [
            {"file": fname, "signals": rows} for fname, rows in sorted(by_file.items())
        ],
        "conflicts": conflicts,
        "conclusion": notebook.get("observation") or intelligence.get("conclusion") or "",
        "missing_evidence": notebook.get("missing_evidence") or list(getattr(validation, "missing_evidence", []) or [])[:6],
        "recommended_next_step": notebook.get("recommended_next_step") or "",
    }
