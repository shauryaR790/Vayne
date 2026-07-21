"""Correlation engine — resolve scanner terminology into canonical entities.

Findings from different tools are normalized (see ``normalization``) and merged
into one canonical object per real-world entity. The merge records, from the raw
evidence alone:

* the canonical vendor / product / service / version identity,
* scanner agreement as ``agreed / capable`` (never vanity ``1 / 1``),
* whether scanners agree on the version,
* explicit contradictions (severity, version), and
* the raw evidence ids that back the entity.

CVE-bearing and non-inventory vulnerability/credential findings keep their prior
identity so the downstream attack-graph parity is preserved; only inventory-class
terminology ("Apache httpd" vs "Apache HTTP") is collapsed across tools.
"""

from __future__ import annotations

import uuid
from collections import defaultdict

import pandas as pd

from vayne.correlator.normalization import (
    CVE_RE,
    resolve_entity,
)
from vayne.models import (
    Asset,
    CanonicalEntity,
    CorrelatedFinding,
    EvidenceConflict,
    Finding,
    ScannerAgreement,
    VersionAgreement,
)

# Which scanners present in a run could plausibly detect each canonical kind.
# Keyed by lowercase source_tool. Used to compute agreement as agreed/capable.
_CAPABLE_BY_KIND: dict[str, tuple[str, ...]] = {
    "service": ("nmap", "nessus", "openvas", "httpx", "naabu"),
    "software": ("nmap", "nessus", "openvas", "nuclei"),
    "database": ("nmap", "nessus", "openvas"),
    "vulnerability": ("nessus", "openvas", "nuclei", "burp", "nmap"),
    "credential": ("nmap", "nessus", "openvas", "burp"),
    "web": ("burp", "nuclei", "httpx", "nmap", "nessus"),
    "informational": ("nmap", "nessus", "openvas"),
    "network": ("nmap", "naabu", "nessus"),
}

# Kinds whose grouping we deliberately do NOT change (keeps attack-path parity).
_LEGACY_KEYED_KINDS = frozenset({"vulnerability", "credential"})

_CONFLICT_IMPACT = {
    "severity": -4,
    "version": -13,
    "host": -12,
    "reachability": -18,
    "port_state": -10,
    "service_identity": -11,
}

_CONFLICT_ACTIONS = {
    "severity": "Normalize severity to a single taxonomy before prioritizing.",
    "version": "Replay service fingerprint to establish authoritative version.",
    "host": "Confirm host identity and DNS/IP mapping.",
    "reachability": "Re-test reachability from a consistent vantage point.",
    "port_state": "Re-probe port state to resolve open/filtered disagreement.",
    "service_identity": "Run targeted service probe to disambiguate identity.",
}

_SEV_RANK = {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}


def correlate_findings(findings: list[Finding]) -> list[CorrelatedFinding]:
    tools_in_run = sorted({(f.source_tool or "").lower() for f in findings if f.source_tool})

    buckets: dict[str, list[Finding]] = defaultdict(list)
    for f in findings:
        buckets[_bucket_key(f)].append(f)

    return [_merge_group(g, tools_in_run) for g in buckets.values()]


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
    if cves:
        port = f.port or 0
        return f"{f.host.lower()}|{port}|{cves[0].upper()}"

    resolution = resolve_entity(
        title=f.title,
        service=f.service,
        evidence_texts=[f.evidence, f.description],
        cve="",
        severity=f.severity,
    )

    # Identity / credential findings correlate by host + canonical identity.
    blob = f"{f.title} {f.service} {f.evidence}".lower()
    if resolution.kind in _LEGACY_KEYED_KINDS or any(
        k in blob for k in ("credential", "password", "kerberos", "ntlm", "bloodhound", "spn")
    ):
        port = f.port or 0
        identity_key = resolution.key(f.host, f.port) if resolution.key(f.host, f.port) else f.title.lower()[:48]
        return f"{f.host.lower()}|{port}|{identity_key}"

    return resolution.key(f.host, f.port)


def _merge_group(group: list[Finding], tools_in_run: list[str]) -> CorrelatedFinding:
    primary = max(group, key=lambda x: _sev_rank(x.severity))
    sources = sorted({f.source_tool for f in group})

    evidence: list[str] = []
    for f in group:
        if f.evidence:
            evidence.append(f.evidence)
        elif f.description:
            evidence.append(f.description)
    evidence = evidence[:8]

    cve = primary.cve or _first_cve(group)
    entity = resolve_entity(
        title=primary.title,
        service=primary.service,
        evidence_texts=[primary.evidence, primary.description, *(f.evidence for f in group)],
        cve=cve,
        severity=primary.severity,
    )

    agreement = _scanner_agreement(entity.kind, group, tools_in_run)
    version_agreement = _version_agreement(entity, group)
    conflicts = _conflicts(group, version_agreement)
    aliases = _aliases(group, entity.label)
    evidence_ids = [f.id for f in group if f.id]
    source_files = sorted({f.source_file for f in group if f.source_file})
    confidence = _correlation_confidence(agreement, evidence, group)

    canonical = CanonicalEntity(
        kind=entity.kind,
        vendor=entity.vendor,
        product=entity.product,
        service=entity.service,
        version=entity.version,
        cpe=entity.cpe,
        label=entity.label,
        key=_bucket_key(primary),
    )

    return CorrelatedFinding(
        id=uuid.uuid4().hex[:12],
        title=primary.title,
        host=primary.host,
        service=primary.service,
        port=primary.port,
        severity=primary.severity,
        cve=cve,
        cwe=primary.cwe,
        description=primary.description,
        evidence=evidence,
        confidence=confidence,
        sources=sources,
        findings=group,
        canonical_entity=canonical,
        scanner_agreement=agreement,
        version_agreement=version_agreement,
        conflicts=conflicts,
        aliases=aliases,
        evidence_ids=evidence_ids,
        source_files=source_files,
    )


def _scanner_agreement(
    kind: str, group: list[Finding], tools_in_run: list[str]
) -> ScannerAgreement:
    agreed = sorted({(f.source_tool or "").lower() for f in group if f.source_tool})
    preferred = _CAPABLE_BY_KIND.get(kind, _CAPABLE_BY_KIND["service"])
    capable = [t for t in tools_in_run if t in preferred]
    for t in agreed:
        if t not in capable:
            capable.append(t)
    if not capable:
        capable = list(agreed) or ["scan"]
    ratio = len(agreed) / max(len(capable), 1)
    return ScannerAgreement(
        agreed=agreed,
        capable=sorted(capable),
        ratio=round(ratio, 4),
        label=f"{len(agreed)} / {len(capable)}",
    )


def _version_agreement(entity, group: list[Finding]) -> VersionAgreement:
    from vayne.correlator.normalization import extract_version

    observed: list[str] = []
    for f in group:
        ver = extract_version(f.title, f.service, f.evidence)
        if ver and ver not in observed:
            observed.append(ver)
    agreed = len(observed) <= 1
    label = (
        f"agree on {observed[0]}" if len(observed) == 1
        else ("no version observed" if not observed else "version disagreement")
    )
    return VersionAgreement(
        observed=observed,
        agreed=agreed,
        canonical=entity.version or (observed[0] if observed else ""),
        label=label,
    )


def _conflicts(
    group: list[Finding], version_agreement: VersionAgreement
) -> list[EvidenceConflict]:
    conflicts: list[EvidenceConflict] = []

    severities = {
        (f.severity or "").lower()
        for f in group
        if (f.severity or "").strip()
    }
    if len(severities) > 1:
        conflicts.append(
            EvidenceConflict(
                kind="severity",
                statements=[
                    f"{f.source_tool}: {f.severity}" for f in group if f.severity
                ][:6],
                detail="Scanners assigned different severity taxonomies to the same entity.",
                confidence_impact=_CONFLICT_IMPACT["severity"],
                suggested_action=_CONFLICT_ACTIONS["severity"],
            )
        )

    if not version_agreement.agreed and len(version_agreement.observed) > 1:
        conflicts.append(
            EvidenceConflict(
                kind="version",
                statements=list(version_agreement.observed)[:6],
                detail="Scanners reported different versions for the same entity.",
                confidence_impact=_CONFLICT_IMPACT["version"],
                suggested_action=_CONFLICT_ACTIONS["version"],
            )
        )

    return conflicts


def _aliases(group: list[Finding], canonical_label: str) -> list[str]:
    seen: list[str] = []
    canon = canonical_label.lower()
    for f in group:
        title = (f.title or "").strip()
        if not title or title.lower() == canon:
            continue
        if title not in seen:
            seen.append(title)
    return seen[:8]


def _correlation_confidence(
    agreement: ScannerAgreement, evidence: list[str], group: list[Finding]
) -> int:
    """Corroboration signal for the correlation layer.

    Kept as an integer for backward compatibility with the correlations view.
    Derived from agreement and evidence density — not a fixed base.
    """
    if not evidence:
        return 0
    score = 0
    score += min(45, int(round(agreement.ratio * 30)) + (len(agreement.agreed) - 1) * 9)
    score += min(30, len(evidence) * 6)
    score += min(20, sum(1 for f in group if f.cve) * 10)
    return max(0, min(95, score))


def _first_cve(group: list[Finding]) -> str:
    for f in group:
        if f.cve:
            return f.cve
    return ""


def _sev_rank(sev: str) -> int:
    return _SEV_RANK.get((sev or "").lower(), 0)
