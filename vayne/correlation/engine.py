"""Finding correlation across scanner outputs."""

from __future__ import annotations

import re
import uuid
from collections import defaultdict

from vayne.models.schemas import CorrelatedFinding, RawFinding

CVE_RE = re.compile(r"CVE-\d{4}-\d+", re.I)
SERVICE_KEYWORDS = {
    "apache": ["apache", "httpd", "cve-2021-41773", "cve-2021-42013"],
    "jenkins": ["jenkins", "hudson"],
    "nginx": ["nginx"],
    "ssh": ["ssh", "openssh"],
    "tomcat": ["tomcat"],
    "s3": ["s3", "bucket", "aws"],
}


def correlate(findings: list[RawFinding]) -> list[CorrelatedFinding]:
    """Group raw findings by host and semantic similarity."""
    buckets: dict[str, list[RawFinding]] = defaultdict(list)

    for f in findings:
        key = _bucket_key(f)
        buckets[key].append(f)

    correlated: list[CorrelatedFinding] = []
    for group in buckets.values():
        correlated.append(_merge_group(group))

    correlated.sort(key=lambda c: (-_severity_rank(c.severity), -c.confidence))
    return correlated


def _bucket_key(f: RawFinding) -> str:
    host = f.host.lower().strip()
    port = f.port or "*"
    theme = _theme(f)
    cves = sorted(set(CVE_RE.findall(f.finding + " " + f.evidence)))
    cve_key = cves[0] if cves else theme
    return f"{host}|{port}|{cve_key}"


def _theme(f: RawFinding) -> str:
    text = f"{f.finding} {f.service} {f.version} {f.evidence}".lower()
    for theme, keywords in SERVICE_KEYWORDS.items():
        if any(k in text for k in keywords):
            return theme
    return f.finding.lower()[:40]


def _merge_group(group: list[RawFinding]) -> CorrelatedFinding:
    primary = max(group, key=lambda f: _severity_rank(f.severity))
    sources = sorted({f.tool for f in group})
    evidence = [f.evidence for f in group if f.evidence][:5]

    versions = [f.version for f in group if f.version]
    services = [f.service for f in group if f.service]

    confidence = min(99, 55 + len(sources) * 12 + (10 if versions else 0))

    title = _human_title(group, primary)

    return CorrelatedFinding(
        id=str(uuid.uuid4())[:12],
        finding=title,
        host=primary.host,
        port=primary.port or _most_common([f.port for f in group]),
        service=services[0] if services else primary.service,
        version=versions[0] if versions else primary.version,
        severity=primary.severity,
        confidence=confidence,
        sources=sources,
        raw_findings=group,
        evidence=evidence,
    )


def _human_title(group: list[RawFinding], primary: RawFinding) -> str:
    text = " ".join(f.finding for f in group).lower()
    cves = CVE_RE.findall(text)
    if "apache" in text and ("rce" in text or "41773" in text or "42013" in text):
        return "Apache RCE"
    if "jenkins" in text:
        return "Exposed Jenkins"
    if cves:
        svc = primary.service or primary.version.split()[0] if primary.version else "Service"
        return f"{svc} {cves[0]}".strip()
    return primary.finding


def _most_common(values: list[str]) -> str:
    vals = [v for v in values if v]
    return max(set(vals), key=vals.count) if vals else ""


def _severity_rank(sev: str) -> int:
    return {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}.get(
        sev.lower(), 0
    )
