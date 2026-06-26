"""Correlation engine — merge findings and build relationships."""

from __future__ import annotations

import re
import uuid
from collections import defaultdict

import pandas as pd

from vayne.models import Asset, CorrelatedFinding, Finding

CVE_RE = re.compile(r"CVE-\d{4}-\d+", re.I)

THEME_KEYWORDS = {
    "s3": ["s3", "bucket", "public", "aws"],
    "iam": ["iam", "role", "policy", "credential", "admin"],
    "apache": ["apache", "httpd", "41773", "42013"],
    "jenkins": ["jenkins", "hudson"],
    "github": ["github", "secret", "leak", "token"],
    "database": ["database", "postgres", "mysql", "rds", "production"],
    "secrets": ["secret", "secrets manager", "vault"],
}


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
    theme = _theme(f)
    cves = CVE_RE.findall(f"{f.title} {f.cve} {f.evidence}")
    cve = cves[0] if cves else theme
    port = f.port or 0
    return f"{f.host.lower()}|{port}|{cve}"


def _theme(f: Finding) -> str:
    text = f"{f.title} {f.description} {f.service} {f.evidence}".lower()
    for theme, keys in THEME_KEYWORDS.items():
        if any(k in text for k in keys):
            return theme
    return f.title.lower()[:48]


def _merge_group(group: list[Finding]) -> CorrelatedFinding:
    primary = max(group, key=lambda x: _sev_rank(x.severity))
    sources = sorted({f.source_tool for f in group})
    evidence = [f.evidence for f in group if f.evidence][:6]
    tags = list({_theme(f) for f in group})

    confidence = min(99, 50 + len(sources) * 10 + len(evidence) * 3)
    title = _title(group, primary)

    return CorrelatedFinding(
        id=uuid.uuid4().hex[:12],
        title=title,
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
        tags=tags,
    )


def _title(group: list[Finding], primary: Finding) -> str:
    text = " ".join(f.title for f in group).lower()
    if "apache" in text and ("rce" in text or "41773" in text):
        return "Apache RCE"
    if "s3" in text and "public" in text:
        return "Public S3 Bucket Exposure"
    if "jenkins" in text:
        return "Exposed Jenkins"
    if "github" in text and "secret" in text:
        return "Leaked GitHub Secret"
    if "iam" in text:
        return "IAM Privilege Exposure"
    return primary.title


def _first_cve(group: list[Finding]) -> str:
    for f in group:
        if f.cve:
            return f.cve
    return ""


def _sev_rank(sev: str) -> int:
    return {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}.get(sev.lower(), 0)
