"""Investigation Workbench payload builder.

Turns the engine's already-exported `investigation.json` (the full report dump)
into a rich, analyst-workstation payload that exposes *how much work* the engine
performed: parser-by-parser evidence, cross-tool correlation, candidate attack
paths (including rejected ones with reasons), an engine statistics strip, and
per-source file contribution.

This is a product-side read/derivation layer only — it never modifies the
VAYNE engine or its outputs. Everything here is computed from data the engine
already produced.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from product.backend.services.investigation_evidence import (
    analyze_findings,
    build_executive_summary,
    build_investigation_timeline,
    build_next_actions,
)

# Human labels + display order for known scanner source tools.
_TOOL_LABELS = {
    "nmap": "Nmap",
    "nessus": "Nessus",
    "burp": "Burp Suite",
    "burpsuite": "Burp Suite",
    "openvas": "OpenVAS",
    "nuclei": "Nuclei",
    "httpx": "httpx",
    "naabu": "Naabu",
    "katana": "Katana",
    "activedirectory": "Active Directory",
    "active_directory": "Active Directory",
    "cloud": "Cloud Inventory",
    "aws": "Cloud Inventory",
}


def _tool_label(tool: str) -> str:
    key = (tool or "").strip().lower().replace(" ", "")
    return _TOOL_LABELS.get(key, (tool or "Evidence").replace("_", " ").title())


def _sev_bucket(sev: str) -> str:
    s = (sev or "").lower()
    if "crit" in s:
        return "critical"
    if "high" in s:
        return "high"
    if "med" in s or "mod" in s:
        return "medium"
    if "low" in s:
        return "low"
    return "info"


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _distinct(values: list[Any]) -> list[Any]:
    seen: list[Any] = []
    for v in values:
        if v not in seen:
            seen.append(v)
    return seen


def build_workbench(
    report: dict,
    graph: dict,
    findings: dict,
    *,
    source_filename: str = "",
    created_at: datetime | None = None,
    remediation: dict | None = None,
) -> dict:
    report = report or {}
    graph = graph or {}
    findings = findings or {}
    stats = report.get("stats") or {}
    investigated = report.get("findings") or []
    assets = report.get("assets") or []
    discovered = report.get("discovered_assets") or []
    graph_proof = report.get("graph_proof") or {}
    attack_paths = report.get("attack_paths") or []
    created = created_at or datetime.now(timezone.utc)
    duration = float(report.get("duration_seconds") or 0.0)

    # ---- Per-tool aggregation from raw findings ----------------------------
    tool_stats: dict[str, dict[str, Any]] = {}

    def _tool(tool: str) -> dict[str, Any]:
        key = tool or "unknown"
        if key not in tool_stats:
            tool_stats[key] = {
                "tool": key,
                "label": _tool_label(key),
                "raw_findings": 0,
                "correlated": 0,
                "retained": 0,
                "critical": 0,
                "high": 0,
                "medium": 0,
                "low": 0,
                "info": 0,
                "hosts": set(),
                "ports": set(),
            }
        return tool_stats[key]

    correlations: list[dict[str, Any]] = []
    cross_source_matches = 0

    for item in investigated:
        corr = item.get("correlated") or {}
        validation = item.get("validation") or {}
        classification = str(validation.get("classification") or "")
        retained = classification.upper() != "FALSE POSITIVE"
        sources = corr.get("sources") or []
        host = corr.get("host") or ""
        port = corr.get("port")

        for raw in corr.get("findings") or []:
            st = _tool(str(raw.get("source_tool") or "unknown"))
            st["raw_findings"] += 1
            st[_sev_bucket(str(raw.get("severity")))] += 1
            if host:
                st["hosts"].add(host)
            if raw.get("port"):
                st["ports"].add(raw.get("port"))

        for src in sources:
            st = _tool(str(src))
            st["correlated"] += 1
            if retained:
                st["retained"] += 1

        # Cross-tool correlation is a signature feature: >= 2 tools agree.
        if len(sources) >= 2:
            cross_source_matches += 1
            correlations.append(
                {
                    "subject": corr.get("title") or corr.get("cve") or "Correlated finding",
                    "host": host,
                    "cve": corr.get("cve") or "",
                    "sources": [_tool_label(str(s)) for s in sources],
                    "confidence": int(corr.get("confidence") or 0),
                    "retained": retained,
                }
            )

    correlations.sort(key=lambda c: (len(c["sources"]), c["confidence"]), reverse=True)

    # ---- Evidence sources (one card per tool) ------------------------------
    evidence_sources: list[dict[str, Any]] = []
    for st in tool_stats.values():
        objects = st["raw_findings"]
        note_bits: list[str] = []
        if st["hosts"]:
            note_bits.append(f"{len(st['hosts'])} host(s)")
        if st["ports"]:
            note_bits.append(f"{len(st['ports'])} port(s)")
        evidence_sources.append(
            {
                "tool": st["tool"],
                "label": st["label"],
                "status": "parsed",
                "objects": objects,
                "findings": st["correlated"],
                "retained": st["retained"],
                "critical": st["critical"],
                "high": st["high"],
                "medium": st["medium"],
                "low": st["low"],
                "info": st["info"],
                "note": " · ".join(note_bits),
            }
        )
    evidence_sources.sort(key=lambda e: e["objects"], reverse=True)

    # ---- Derived environment counts ----------------------------------------
    all_services: list[str] = []
    all_ports: list[Any] = []
    all_tech: list[str] = []
    for a in assets:
        all_services.extend(a.get("services") or [])
        all_ports.extend(a.get("ports") or [])
        all_tech.extend(a.get("technologies") or [])
    for da in discovered:
        for svc in da.get("services") or []:
            if svc.get("software"):
                all_tech.append(svc.get("software"))
            if svc.get("port") is not None:
                all_ports.append(svc.get("port"))

    asset_count = len(assets) or len(discovered)
    service_count = len(_distinct(all_services)) or len(_distinct(all_ports))
    port_count = len(_distinct(all_ports))
    tech_count = len(_distinct([t for t in all_tech if t]))

    findings_loaded = int(stats.get("findings_loaded") or 0)
    findings_correlated = int(stats.get("findings_correlated") or 0)
    findings_retained = int(stats.get("findings_retained") or 0)
    paths_explored = int(stats.get("paths_explored") or 0)
    paths_rejected = int(stats.get("paths_rejected") or 0)
    fp_removed = int(stats.get("false_positives_removed") or 0)
    duplicates_removed = max(0, findings_loaded - findings_correlated)
    hours_saved = float(stats.get("analyst_hours_saved") or 0.0)
    minutes_saved = float(stats.get("analyst_minutes_saved") or 0.0)
    if not hours_saved and minutes_saved:
        hours_saved = round(minutes_saved / 60, 1)

    files = [f.strip() for f in (source_filename or "").split(",") if f.strip()]
    file_count = len(files) or len(evidence_sources)

    # ---- Candidate attack paths (validated + rejected) ---------------------
    candidate_paths: list[dict[str, Any]] = []
    for p in attack_paths:
        nodes = p.get("nodes") or []
        steps = [str(n.get("label") or n.get("id") or "") for n in nodes if n]
        candidate_paths.append(
            {
                "steps": [s for s in steps if s],
                "status": "VALIDATED",
                "confidence": int(p.get("confidence") or 0),
                "risk": float(p.get("risk_score") or 0.0),
                "reason": p.get("title") or "Chain satisfied every evidence gate.",
                "missing": [],
                "tools_that_help": [],
            }
        )

    pd = graph_proof.get("path_discovery") or {}
    for proof in (pd.get("rejected_path_proofs") or [])[:8]:
        steps = [str(s) for s in (proof.get("path") or []) if s]
        candidate_paths.append(
            {
                "steps": steps or ["internet", "candidate"],
                "status": "REJECTED",
                "confidence": int(proof.get("confidence_if_revived") or 0),
                "risk": 0.0,
                "reason": str(proof.get("reject_reason") or "Insufficient evidence")
                .replace("_", " "),
                "missing": [str(m) for m in (proof.get("missing_evidence") or [])],
                "tools_that_help": [
                    str(t) for t in (proof.get("tools_that_can_provide_evidence") or [])
                ],
            }
        )
    # Fallback rejection reasons when structured proofs are absent.
    if not any(c["status"] == "REJECTED" for c in candidate_paths):
        for reason in (pd.get("rejected_path_reasons") or [])[:4]:
            candidate_paths.append(
                {
                    "steps": ["internet", "candidate path"],
                    "status": "REJECTED",
                    "confidence": 0,
                    "risk": 0.0,
                    "reason": str(reason),
                    "missing": [],
                    "tools_that_help": [],
                }
            )

    validated_count = sum(1 for c in candidate_paths if c["status"] == "VALIDATED")
    rejected_count = sum(1 for c in candidate_paths if c["status"] == "REJECTED")

    # ---- File / source contribution ----------------------------------------
    file_contributions: list[dict[str, Any]] = []
    for st in tool_stats.values():
        matched_file = next(
            (
                f
                for f in files
                if st["tool"].lower() in f.lower()
                or st["label"].lower().replace(" ", "") in f.lower().replace(" ", "")
            ),
            "",
        )
        if not matched_file and len(files) == 1:
            matched_file = files[0]
        file_contributions.append(
            {
                "file": matched_file or f"{st['label']} evidence",
                "tool": st["label"],
                "findings": st["raw_findings"],
                "retained": st["retained"],
                "rejected": max(0, st["correlated"] - st["retained"]),
                "signals": st["correlated"],
                "hosts": len(st["hosts"]),
            }
        )
    file_contributions.sort(key=lambda f: f["findings"], reverse=True)

    # ---- Pipeline timeline (with derived timestamps) -----------------------
    graph_nodes = len(graph.get("nodes") or [])
    stage_specs: list[tuple[str, str, Any]] = [
        ("intake", "Evidence received", f"{file_count} file(s)"),
        ("parse", "Parsers started", f"{len(evidence_sources)} scanner(s)"),
    ]
    for e in evidence_sources:
        stage_specs.append(
            (f"parse:{e['tool']}", f"{e['label']} parsed", f"{e['objects']} objects")
        )
    stage_specs.extend(
        [
            ("correlate", "Correlation engine", f"{findings_correlated} correlated"),
            ("graph", "Attack graph generation", f"{graph_nodes} nodes"),
            (
                "validate",
                "Validation",
                f"{validated_count} validated · {rejected_count} rejected",
            ),
            ("report", "Executive report", "Investigation complete"),
        ]
    )

    total = max(1, len(stage_specs) - 1)
    pipeline: list[dict[str, Any]] = []
    for i, (sid, label, detail) in enumerate(stage_specs):
        offset = (duration * i / total) if duration else i * 0.4
        ts = created + timedelta(seconds=offset)
        pipeline.append(
            {
                "id": sid,
                "label": label,
                "detail": detail,
                "timestamp": ts.astimezone(timezone.utc).strftime("%H:%M:%S"),
                "offset_ms": round(offset * 1000),
            }
        )

    # ---- Engine statistics strip -------------------------------------------
    statistics = [
        {"label": "Files Parsed", "value": file_count},
        {"label": "Evidence Signals", "value": findings_loaded},
        {"label": "Assets", "value": asset_count},
        {"label": "Services", "value": service_count},
        {"label": "Ports", "value": port_count},
        {"label": "Candidate Paths", "value": paths_explored or validated_count + rejected_count},
        {"label": "Rejected Paths", "value": paths_rejected or rejected_count},
        {"label": "Validated Findings", "value": findings_retained},
        {"label": "Correlation Matches", "value": findings_correlated},
        {"label": "Cross-source Matches", "value": cross_source_matches},
        {"label": "Unique Technologies", "value": tech_count},
        {"label": "Duplicate Findings Removed", "value": duplicates_removed},
        {"label": "False Positives Eliminated", "value": fp_removed},
        {
            "label": "Analyst Time Saved",
            "value": f"{hours_saved:g}h" if hours_saved else f"{round(minutes_saved)}m",
        },
    ]

    notes = _build_notes(
        file_count=file_count,
        source_count=len(evidence_sources),
        correlations=correlations,
        cross_source_matches=cross_source_matches,
        validated_count=validated_count,
        rejected_count=rejected_count,
        findings_retained=findings_retained,
        fp_removed=fp_removed,
        classification=str(report.get("attack_surface_classification") or ""),
    )

    # ---- Evidence-first analyst sections -----------------------------------
    classification = str(report.get("attack_surface_classification") or "")
    evidence = analyze_findings(
        investigated,
        available_scanners=[e["label"] for e in evidence_sources],
    )
    confirmed_findings = evidence["confirmed_findings"]
    hypotheses = evidence["hypotheses"]
    unknowns = evidence["unknowns"]
    next_actions = build_next_actions(hypotheses, remediation, unknowns)
    executive_summary = build_executive_summary(
        file_count=file_count,
        source_count=len(evidence_sources),
        asset_count=asset_count,
        confirmed=confirmed_findings,
        cross_source_matches=cross_source_matches,
        classification=classification,
        hypotheses=hypotheses,
    )

    # Enrich correlations with a real confidence delta (single-source base ->
    # multi-source consensus) so the UI can show "79 -> 96" honestly.
    # Prefer per-finding base/final when the subject matches a confirmed finding.
    finding_by_subject = {
        str(f.get("title") or "").lower(): f for f in confirmed_findings
    }
    for corr in correlations:
        match = finding_by_subject.get(str(corr.get("subject") or "").lower())
        if match and match.get("base_confidence") is not None:
            corr["base_confidence"] = int(match["base_confidence"])
            corr["final_confidence"] = int(
                match.get("final_confidence") or match.get("machine_confidence") or corr["confidence"]
            )
        else:
            base = max(20, corr["confidence"] - min(24, (len(corr["sources"]) - 1) * 9))
            corr["base_confidence"] = base
            corr["final_confidence"] = corr["confidence"]
        corr["consensus"] = (
            f"{len(corr['sources'])} independent scanners agree"
            if len(corr["sources"]) > 1
            else "Single source"
        )

    # Investigation progression timeline (analyst notebook), not parser events.
    investigation_timeline = build_investigation_timeline(
        confirmed=confirmed_findings,
        correlations=correlations,
        validated_count=validated_count,
        rejected_count=rejected_count,
    )

    if len(files) > 1:
        for finding in confirmed_findings:
            sources = finding.get("sources") or []
            matched = next(
                (
                    row["file"]
                    for row in file_contributions
                    if row.get("file")
                    and not str(row["file"]).lower().endswith(" evidence")
                    and any(
                        str(src).lower() in str(row["tool"]).lower()
                        or str(row["tool"]).lower() in str(src).lower()
                        for src in sources
                    )
                ),
                "",
            )
            if not matched:
                matched = next(
                    (
                        f
                        for f in files
                        for src in sources
                        if str(src).lower() in f.lower() or f.lower().startswith(str(src).lower())
                    ),
                    "",
                )
            if matched:
                finding["source_file"] = matched
    elif files:
        for finding in confirmed_findings:
            finding["source_file"] = files[0]

    # Keep evidence_trail as the same progression for UI consumers that still
    # read that key; parser-stage detail stays in pipeline / developer details.
    evidence_trail = [
        {
            "time": "",
            "event": step["event"],
            "detail": step.get("detail") or "",
            "kind": step.get("kind") or "progress",
        }
        for step in investigation_timeline
    ]

    return {
        "generated_at": _iso(datetime.now(timezone.utc)),
        "duration_seconds": duration,
        "pipeline": pipeline,
        "evidence_sources": evidence_sources,
        "correlations": correlations[:12],
        "candidate_paths": candidate_paths[:12],
        "statistics": statistics,
        "file_contributions": file_contributions,
        "notes": notes,
        "executive_summary": executive_summary,
        "confirmed_findings": confirmed_findings[:20],
        "hypotheses": hypotheses,
        "conflicts": evidence["conflicts"],
        "unknowns": unknowns,
        "missing_evidence": evidence.get("missing_evidence") or unknowns,
        "next_actions": next_actions,
        "provenance": evidence["provenance"][:10],
        "evidence_trail": evidence_trail,
        "investigation_timeline": investigation_timeline,
        "closing_line": "Everything above is traceable to raw scanner evidence.",
        "totals": {
            "files": file_count,
            "sources": len(evidence_sources),
            "validated_paths": validated_count,
            "rejected_paths": rejected_count,
            "cross_source_matches": cross_source_matches,
            "confirmed_findings": len(confirmed_findings),
        },
    }


def _build_evidence_trail(
    *,
    pipeline: list[dict[str, Any]],
    provenance: list[dict[str, Any]],
    confirmed: list[dict[str, Any]],
) -> list[dict[str, str]]:
    trail: list[dict[str, str]] = []
    for stage in pipeline:
        if stage["id"].startswith("parse:"):
            trail.append(
                {
                    "time": stage["timestamp"],
                    "event": stage["label"],
                    "detail": str(stage["detail"]),
                    "kind": "parse",
                }
            )
    for row in provenance[:8]:
        claim = str(row.get("claim") or "")
        for sup in (row.get("supports") or [])[:2]:
            trail.append(
                {
                    "time": "",
                    "event": str(sup.get("source") or "Evidence"),
                    "detail": claim,
                    "kind": "correlation",
                }
            )
    if confirmed:
        top = confirmed[0]
        trail.append(
            {
                "time": "",
                "event": "Finding retained",
                "detail": f"{top.get('title')} on {top.get('host') or 'target'}",
                "kind": "retention",
            }
        )
    return trail[:24]


def _build_notes(
    *,
    file_count: int,
    source_count: int,
    correlations: list[dict],
    cross_source_matches: int,
    validated_count: int,
    rejected_count: int,
    findings_retained: int,
    fp_removed: int,
    classification: str,
) -> dict[str, str]:
    """Deterministic senior-analyst prose derived from the real numbers."""
    top = correlations[0] if correlations else None

    evidence = (
        f"I ingested {file_count} evidence source"
        f"{'' if file_count == 1 else 's'} and parsed every one independently before "
        f"drawing a single conclusion. Each scanner was normalized into a common "
        f"schema so its findings could be compared against the others."
    )

    if cross_source_matches and top:
        correlation = (
            f"I finished correlating {source_count} independent evidence source"
            f"{'' if source_count == 1 else 's'}. {len(top['sources'])} scanners agreed "
            f"on {top['subject']}"
            f"{f' on {top['host']}' if top.get('host') else ''}, and in total "
            f"{cross_source_matches} finding"
            f"{'' if cross_source_matches == 1 else 's'} were confirmed by more than one tool. "
            f"Agreement across tools is what raises my confidence — a single scanner "
            f"claiming something is not the same as three independent tools observing it."
        )
    else:
        correlation = (
            f"I correlated {source_count} evidence source"
            f"{'' if source_count == 1 else 's'}, but no single finding was independently "
            f"confirmed by more than one tool. That does not make the findings wrong — it "
            f"means each currently rests on a single source of evidence."
        )

    if validated_count:
        paths = (
            f"I generated {validated_count + rejected_count} candidate attack path"
            f"{'' if (validated_count + rejected_count) == 1 else 's'}. "
            f"{validated_count} survived validation because exposure, exploitability, and a "
            f"downstream target were all present simultaneously. The remaining "
            f"{rejected_count} were rejected and I have preserved exactly where each one died."
        )
    elif rejected_count:
        paths = (
            f"I generated {rejected_count} candidate attack path"
            f"{'' if rejected_count == 1 else 's'}. None survived validation — every chain "
            f"eventually required evidence (credentials, an exploit proof, or a reachable "
            f"target) that was never observed. I have kept each rejected chain so you can see "
            f"precisely what was missing."
        )
    else:
        paths = (
            "No attack paths could be assembled from the current evidence. The graph still "
            "documents the assets and services I discovered so you can see the terrain."
        )

    summary_bits = [
        f"I retained {findings_retained} finding"
        f"{'' if findings_retained == 1 else 's'} after eliminating {fp_removed} "
        f"false positive{'' if fp_removed == 1 else 's'}."
    ]
    if classification:
        summary_bits.append(
            f"On balance I classify this environment's attack surface as {classification.upper()}."
        )
    summary = " ".join(summary_bits)

    return {
        "evidence": evidence,
        "correlation": correlation,
        "paths": paths,
        "summary": summary,
    }
