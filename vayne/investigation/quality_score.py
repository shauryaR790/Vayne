"""Investigation quality score — multi-dimensional analyst prioritization (Rule 6)."""

from __future__ import annotations

from typing import Any

from vayne.models import AttackPath, InvestigatedFinding

_EFFORT_SCORE = {
    "low": 25,
    "medium": 50,
    "high": 75,
    "very high": 90,
    "unknown": 50,
}


def _effort_score(path: AttackPath) -> int:
    raw = (path.attacker_effort or path.complexity or "medium").strip().lower()
    for label, score in _EFFORT_SCORE.items():
        if label in raw:
            return score
    return 50


def compute_quality_score(
    *,
    members: list[InvestigatedFinding],
    attack_paths: list[AttackPath],
    cluster_type: str,
) -> dict[str, int]:
    scores: dict[str, int] = {
        "business_impact": 0,
        "exploitability": 0,
        "attack_complexity": 50,
        "blast_radius": 0,
        "data_sensitivity": 0,
        "identity_exposure": 0,
        "internet_exposure": 0,
        "persistence_opportunity": 0,
        "confidence": 0,
        "investigation_completeness": 0,
    }

    if not members:
        return scores

    confidences: list[int] = []
    for item in members:
        val = item.validation
        intel = item.intelligence or {}
        bi = intel.get("business_impact") or {}
        confidences.append(int(val.overall_confidence))

        scores["business_impact"] = max(scores["business_impact"], int(bi.get("score") or val.impact_confidence or 0))
        scores["exploitability"] = max(scores["exploitability"], int(val.exploit_confidence))
        scores["data_sensitivity"] = max(scores["data_sensitivity"], _data_sensitivity(item))
        scores["internet_exposure"] = max(scores["internet_exposure"], _internet_exposure(item))

        inv = intel.get("investigation") or {}
        if not inv.get("deferred"):
            scores["investigation_completeness"] += 15

    scores["confidence"] = sum(confidences) // max(1, len(confidences))

    related_paths = _paths_for_members(members, attack_paths)
    if related_paths:
        scores["blast_radius"] = max(int(p.blast_radius or 0) for p in related_paths)
        avg_effort = sum(_effort_score(p) for p in related_paths) // len(related_paths)
        scores["attack_complexity"] = max(0, 100 - avg_effort)
        if any("persist" in (p.attack_category or "").lower() for p in related_paths):
            scores["persistence_opportunity"] = 75

    if cluster_type in ("identity", "credential"):
        scores["identity_exposure"] = max(scores["identity_exposure"], 80)

    scores["investigation_completeness"] = min(100, scores["investigation_completeness"] // max(1, len(members)))

    return {k: max(0, min(100, v)) for k, v in scores.items()}


def composite_priority_score(quality: dict[str, int]) -> int:
    weights = {
        "business_impact": 0.18,
        "exploitability": 0.16,
        "internet_exposure": 0.12,
        "confidence": 0.14,
        "blast_radius": 0.10,
        "data_sensitivity": 0.10,
        "identity_exposure": 0.08,
        "investigation_completeness": 0.12,
    }
    total = sum(quality.get(k, 0) * w for k, w in weights.items())
    return max(0, min(99, int(round(total))))


def _data_sensitivity(item: InvestigatedFinding) -> int:
    blob = f"{item.correlated.title} {item.correlated.cve or ''}".lower()
    if any(k in blob for k in ("database", "pii", "secret", "credential", "s3", "bucket")):
        return 80
    return int(item.validation.impact_confidence * 0.6)


def _internet_exposure(item: InvestigatedFinding) -> int:
    reasoning = " ".join(item.intelligence.get("reasoning") or []) if item.intelligence else ""
    if "internet" in reasoning.lower() or "external" in reasoning.lower():
        return 85
    if item.correlated.port in (80, 443, 8080, 8443):
        return 60
    return 20


def _paths_for_members(members: list[InvestigatedFinding], paths: list[AttackPath]) -> list[AttackPath]:
    ids = {m.correlated.id for m in members}
    out: list[AttackPath] = []
    for p in paths:
        if any(n.id.endswith(tuple(ids)) or f"vuln:{fid}" in n.id for n in p.nodes for fid in ids):
            out.append(p)
        elif any(fid in (p.title or "") for fid in ids):
            out.append(p)
    return out
