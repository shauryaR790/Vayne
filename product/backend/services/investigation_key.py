"""Investigation identity — stable deduplication key from engine output."""

from __future__ import annotations

import hashlib
import json
from typing import Any


def _canonical_json(data: Any) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), default=str)


def normalize_source_filename(name: str) -> str:
    raw = (name or "").strip()
    if not raw:
        return ""
    parts = [p.strip().split("/")[-1].split("\\")[-1].lower() for p in raw.split(",") if p.strip()]
    return ",".join(sorted(parts))


def compact_investigation_name(
    name: str,
    *,
    filenames: list[str] | None = None,
    max_len: int = 200,
) -> str:
    """Short display title for DB storage — never join hundreds of filenames."""
    cleaned = [f.strip().split("/")[-1].split("\\")[-1] for f in (filenames or []) if f.strip()]
    if not cleaned:
        return (name or "web-investigation").strip()[:max_len]

    if len(cleaned) == 1:
        return cleaned[0][:max_len]

    joined = ", ".join(cleaned)
    if len(cleaned) <= 3 and len(joined) <= max_len:
        return joined

    first = cleaned[0]
    suffix = f" + {len(cleaned) - 1} more files"
    budget = max_len - len(suffix)
    if budget < 8:
        return f"{len(cleaned)} evidence files"[:max_len]
    return f"{first[:budget]}{suffix}"


def _normalize_validated_findings(findings: list[Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for finding in findings:
        rows.append({
            "title": finding.get("title"),
            "classification": finding.get("classification"),
            "cve": finding.get("cve"),
            "host": finding.get("host"),
            "confidence": finding.get("confidence"),
        })
    return sorted(
        rows,
        key=lambda row: (
            str(row.get("title") or ""),
            str(row.get("host") or ""),
            str(row.get("cve") or ""),
            str(row.get("classification") or ""),
            str(row.get("confidence") or ""),
        ),
    )


def _normalize_attack_paths(paths: list[Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in paths:
        story = path.get("attack_story") or {}
        rows.append({
            "stable_id": path.get("stable_id"),
            "confidence": path.get("confidence"),
            "risk": path.get("risk"),
            "attack_category": path.get("attack_category"),
            "blast_radius": path.get("blast_radius"),
            "mitre_tactics": sorted(path.get("mitre_tactics") or []),
            "mitre_techniques": sorted(path.get("mitre_techniques") or []),
            "narrative": story.get("narrative"),
        })
    return sorted(rows, key=lambda row: str(row.get("stable_id") or ""))


def _stable_list(items: list[Any], sort_key) -> list[Any]:
    return sorted(items, key=sort_key)


def compute_investigation_key(
    source_filename: str,
    validated_findings: list[Any],
    attack_paths: list[Any],
    risk_score: float | int,
) -> str:
    """SHA-256 fingerprint for deduplicating identical analysis results."""
    stable_findings = _normalize_validated_findings(validated_findings)
    stable_paths = _normalize_attack_paths(attack_paths)
    payload = (
        normalize_source_filename(source_filename)
        + _canonical_json(stable_findings)
        + _canonical_json(stable_paths)
        + str(int(risk_score))
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def build_investigation_summary(
    validated_findings: list[Any],
    attack_paths: list[Any],
) -> str:
    if attack_paths:
        path = attack_paths[0]
        story = path.get("attack_story") or {}
        narrative = (story.get("narrative") or "").strip()
        if narrative:
            return narrative[:120]
        title = (path.get("title") or path.get("stable_id") or "").strip()
        if title:
            return title[:120]
        return "Validated exploitation chain discovered"

    if validated_findings:
        finding = validated_findings[0]
        title = (finding.get("title") or finding.get("cve") or "").strip()
        if title:
            return title[:120]
        return "Findings retained · surface mapped"

    return "Attack surface mapped · no validated chain"


def compute_key_from_export_dir(
    source_filename: str,
    export_dir,
    risk_score: float | int,
) -> str:
    from pathlib import Path

    root = Path(export_dir)
    findings = {}
    paths: list[Any] = []
    findings_path = root / "findings.json"
    paths_path = root / "attack_paths.json"
    if findings_path.exists():
        findings = json.loads(findings_path.read_text(encoding="utf-8"))
    if paths_path.exists():
        loaded = json.loads(paths_path.read_text(encoding="utf-8"))
        paths = loaded if isinstance(loaded, list) else []
    return compute_investigation_key(
        source_filename,
        findings.get("validated") or [],
        paths,
        risk_score,
    )
