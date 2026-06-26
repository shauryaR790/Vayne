"""Correlation engine — merge findings without theme-based path selection."""

from __future__ import annotations

import re
import uuid
from collections import defaultdict

import pandas as pd

from vayne.models import Asset, CorrelatedFinding, Finding

CVE_RE = re.compile(r"CVE-\d{4}-\d+", re.I)


def correlate_findings(findings: list[Finding]) -> list[CorrelatedFinding]:
    buckets: dict[str, list[Finding]] = defaultdict(list)
    for f in findings:
        key = _bucket_key(f)
        buckets[key].append(f)

    return [_merge_group(g) for g in buckets.values()]


def correlate_assets(assets: list[Asset]) -> list[Asset]:
    merged: dict[str, Asset] = {}
    for a in assets:
        if a.host not in merged:
            merged[a.host] = a.model_copy()
        else:
            m = merged[a.host]
            m.ports = sorted(set(m.ports + a.ports))
            m.services = sorted(set(m.services + a.services))
            m.technologies = sorted(set(m.technologies + a.technologies))
            m.tags = sorted(set(m.tags + a.tags))
            if a.ip and not m.ip:
                m.ip = a.ip
    return list(merged.values())


def findings_dataframe(findings: list[Finding]) -> pd.DataFrame:
    return pd.DataFrame([f.model_dump() for f in findings])


def _bucket_key(f: Finding) -> str:
    cves = CVE_RE.findall(f"{f.title} {f.cve} {f.evidence}")
    cve = cves[0] if cves else f.title.lower()[:48]
    port = f.port or 0
    return f"{f.host.lower()}|{port}|{cve}"


def _merge_group(group: list[Finding]) -> CorrelatedFinding:
    primary = max(group, key=lambda x: _sev_rank(x.severity))
    sources = sorted({f.source_tool for f in group})
    evidence = []
    for f in group:
        if f.evidence:
            evidence.append(f.evidence)
        elif f.description:
            evidence.append(f.description)
    evidence = evidence[:8]

    confidence = _correlation_confidence(sources, evidence, group)

    return CorrelatedFinding(
        id=uuid.uuid4().hex[:12],
        title=primary.title,
        host=primary.host,
        service=primary.service,
        port=primary.port,
        severity=primary.severity,
        cve=primary.cve or _first_cve(group),
        cwe=primary.cwe,
        description=primary.description,
        evidence=evidence,
        confidence=confidence,
        sources=sources,
        findings=group,
    )


def _correlation_confidence(
    sources: list[str], evidence: list[str], group: list[Finding]
) -> int:
    if not evidence:
        return 0
    score = min(40, len(sources) * 12)
    score += min(30, len(evidence) * 6)
    score += min(20, sum(1 for f in group if f.cve) * 10)
    return min(95, score)


def _first_cve(group: list[Finding]) -> str:
    for f in group:
        if f.cve:
            return f.cve
    return ""


def _sev_rank(sev: str) -> int:
    return {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}.get(sev.lower(), 0)
