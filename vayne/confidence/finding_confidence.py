"""Weighted feature-vector confidence for a single correlated finding.

Design rules (Priority 1):

* No base score, no hardcoded 85 / 75 / 60. Every point comes from a named
  feature delta derived from this finding's own evidence.
* Four independent dimensions (observation / exploit / impact / overall), each
  normalized to 0-100.
* Every dimension keeps its ordered factor contributions so a UI can answer
  "why is this N%?" deterministically, without the LLM.
* Continuous features (banner length, version depth, agreement ratio,
  observation count) guarantee scores spread naturally — two unrelated findings
  colliding on a value would require identical evidence.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from vayne.evidence.quality import AggregateQuality, aggregate_quality
from vayne.models import CorrelatedFinding

# --- evidence-quality signals (local to the engine) ------------------------- #
_STRONG_BANNER_RE = re.compile(
    r"(?i)(openssh|apache|nginx|iis|vsftpd|proftpd|postfix|bind|mysql|mariadb|"
    r"postgresql|postgres|redis|mongodb|jenkins|tomcat|grafana|weblogic|exchange|"
    r"samba|smb|microsoft|openssl)"
)
_VERSION_RE = re.compile(
    r"(?<![\w.])(\d+\.\d+(?:\.\d+){0,3}(?:[-_]?(?:p\d+|build\d+|[A-Za-z]*\d[\w.]*))?)(?![\w.])"
)
_PATCH_RE = re.compile(r"(?i)(p\d+|build\d+|ubuntu|debian|el\d|\+deb|\.rc\d)")
_CPE_RE = re.compile(r"cpe:/[aoh]:[^\s\"']+", re.I)
_CVE_RE = re.compile(r"CVE-\d{4}-\d{3,7}", re.I)
_ERROR_RE = re.compile(
    r"(?i)\b(error|unable to|failed|timeout|no response|not found|unknown|"
    r"tcpwrapped|filtered|closed)\b"
)
_FP_RE = re.compile(
    r"(?i)(false positive|unable to obtain|no data|empty response|inconclusive)"
)
_WEAK_RE = re.compile(
    r"(?i)^(http-title|ssl-date|nping|tcpwrapped|traceroute|fingerprint)$|echo reply"
)
_EXPLOIT_HINT_RE = re.compile(
    r"(?i)(anonymous|backdoor|rce|remote code|unauth|default.?pass|vsftpd 2\.3\.4|"
    r"heartbleed|shellshock|log4j|deserial|overflow|traversal|injection|"
    r"weak cipher|sslv2|export40|sql injection|command injection)"
)
_DATA_RE = re.compile(
    r"(?i)(database|postgres|mysql|mariadb|mongodb|redis|rds|s3|bucket|"
    r"secret|credential|password|access key|token|dump|\.env)"
)

_EVIDENCE_CLASS_WEIGHT = {
    "vulnerability": 12,
    "software": 10,
    "database": 10,
    "credential": 11,
    "service": 9,
    "web": 9,
    "network": 5,
    "informational": 4,
}

# Kinds where an exploit dimension is not analytically meaningful.
_NON_EXPLOITABLE_KINDS = frozenset({"informational", "network"})


@dataclass
class ConfidenceResult:
    observation: int
    reliability: int
    exploit: int
    impact: int
    overall: int
    factors: dict[str, list[dict[str, Any]]]
    dimensions: list[str]
    supporting_evidence: list[str]
    contradicting_evidence: list[str]
    missing_evidence: list[str]
    kind: str
    evidence_quality: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "observation": self.observation,
            "reliability": self.reliability,
            "exploit": self.exploit,
            "impact": self.impact,
            "overall": self.overall,
            "factors": self.factors,
            "dimensions": self.dimensions,
            "supporting_evidence": self.supporting_evidence,
            "contradicting_evidence": self.contradicting_evidence,
            "missing_evidence": self.missing_evidence,
            "kind": self.kind,
            "evidence_quality": self.evidence_quality,
        }


@dataclass
class _Factor:
    label: str
    delta: int
    category: str  # observation | reliability | exploit | impact
    kind: str = "positive"  # positive | negative

    def as_dict(self) -> dict[str, Any]:
        return {"label": self.label, "delta": int(self.delta), "category": self.category}


def _clamp(n: int, lo: int = 0, hi: int = 100) -> int:
    return max(lo, min(hi, int(round(n))))


def compute_finding_confidence(
    finding: CorrelatedFinding,
    checks: dict[str, bool],
    *,
    classification: str = "",
    exploitability_status: str = "",
    observation_status: str = "",
) -> ConfidenceResult:
    """Build the four-dimensional confidence for one correlated finding."""
    entity = finding.canonical_entity
    kind = (entity.kind if entity else "service") or "service"
    agreement = finding.scanner_agreement
    version_agreement = finding.version_agreement
    quality = aggregate_quality(finding.findings or [])

    evidence_text = "\n".join(
        [finding.title or "", finding.description or "", *(finding.evidence or [])]
    ).strip()
    body = evidence_text

    factors: list[_Factor] = []

    # ---- OBSERVATION: does this asset / service / vuln exist? -------------- #
    factors.append(
        _Factor(f"Evidence class: {kind}", _EVIDENCE_CLASS_WEIGHT.get(kind, 10), "observation")
    )

    factors.append(_banner_factor(body, finding.title or ""))
    factors.extend(_version_factors(entity, version_agreement, checks))

    if entity and entity.cpe:
        factors.append(_Factor("CPE identifier present", 9, "observation"))
    else:
        factors.append(_Factor("No CPE identifier", -3, "observation", "negative"))

    factors.append(_agreement_factor(agreement))

    observations = max(
        len(finding.evidence_ids or []),
        len([e for e in (finding.evidence or []) if e]),
        len(finding.findings or []),
        1,
    )
    factors.append(
        _Factor(
            f"{observations} independent observation(s)",
            min(14, 3 + observations * 4),
            "observation",
        )
    )

    for conflict in finding.conflicts or []:
        impact = int(getattr(conflict, "confidence_impact", 0) or 0)
        if not impact:
            impact = {
                "severity": -10,
                "version": -12,
                "host": -12,
                "reachability": -18,
                "port_state": -10,
                "service_identity": -11,
            }.get(conflict.kind, -8)
        label = conflict.detail or f"Conflicting {conflict.kind} claims"
        factors.append(
            _Factor(label[:80], impact, "observation", "negative")
        )

    fp = _false_positive_factor(body, finding.title or "")
    if fp:
        factors.append(fp)

    if checks.get("reachable"):
        factors.append(_Factor("Reachable from entry point", 10, "observation"))
    elif checks.get("port_open") or checks.get("host_alive"):
        factors.append(_Factor("Host / port responsive", 6, "observation"))

    # ---- EVIDENCE RELIABILITY: how much do we trust the evidence? --------- #
    factors.extend(_reliability_factors(quality))

    # ---- EXPLOIT: how likely can this be exploited? ----------------------- #
    if kind not in _NON_EXPLOITABLE_KINDS:
        cve = finding.cve or (_CVE_RE.search(body).group(0) if _CVE_RE.search(body) else "")
        if cve:
            factors.append(
                _Factor(
                    f"CVE mapped ({cve})",
                    14 if checks.get("cve_applicable") else 8,
                    "exploit",
                )
            )
        if checks.get("cve_applicable"):
            factors.append(_Factor("CVE applicability confirmed", 12, "exploit"))
        if _EXPLOIT_HINT_RE.search(body):
            factors.append(_Factor("Exploit-relevant evidence pattern", 9, "exploit"))
        if checks.get("prerequisites_met"):
            factors.append(_Factor("Exploit prerequisites met", 10, "exploit"))
        if checks.get("reproducible") or exploitability_status == "confirmed":
            factors.append(_Factor("Exploit reproduced / confirmed", 20, "exploit"))
        if checks.get("reachable") and not checks.get("auth_required"):
            factors.append(_Factor("Internet-exposed, unauthenticated path", 11, "exploit"))
        if checks.get("auth_required"):
            factors.append(_Factor("Authentication required", -9, "exploit", "negative"))
        epss, kev = _epss_kev(finding)
        if epss is not None:
            factors.append(_Factor(f"EPSS {epss:.2f}", _clamp(int(round(epss * 22)), 0, 22), "exploit"))
        if kev:
            factors.append(_Factor("Known-exploited (KEV) catalog", 16, "exploit"))

    # ---- IMPACT: does this affect business operations? -------------------- #
    sev = (finding.severity or "").lower()
    sev_delta = {"critical": 20, "high": 13, "medium": 6, "low": 2, "info": -4}.get(sev, 0)
    if sev_delta:
        factors.append(
            _Factor(f"{sev.title() or 'Info'} severity", sev_delta, "impact",
                    "negative" if sev_delta < 0 else "positive")
        )
    if checks.get("privilege_escalation_possible"):
        factors.append(_Factor("Privilege escalation evidenced", 15, "impact"))
    if checks.get("lateral_movement_possible"):
        factors.append(_Factor("Lateral movement / downstream reach", 13, "impact"))
    if checks.get("reachable"):
        factors.append(_Factor("Internet-facing exposure", 10, "impact"))
    if kind == "credential" or _DATA_RE.search(body):
        factors.append(_Factor("Sensitive data / credential exposure", 11, "impact"))
    if checks.get("cve_applicable") and sev in ("critical", "high"):
        factors.append(_Factor("Confirmed high-severity exposure", 8, "impact"))

    return _assemble(factors, kind=kind, finding=finding, checks=checks, quality=quality)


# --------------------------------------------------------------------------- #
# Feature builders
# --------------------------------------------------------------------------- #
def _banner_factor(body: str, title: str) -> _Factor:
    text = (body or "").strip()
    if not text or _FP_RE.search(text):
        return _Factor("Failed / empty banner", -18, "observation", "negative")
    if _ERROR_RE.search(text) and len(text) < 80:
        return _Factor("Error / inconclusive banner", -12, "observation", "negative")
    if _WEAK_RE.search(title or "") or _WEAK_RE.search(text[:40]):
        return _Factor("Weak metadata evidence", 4, "observation")

    score = 0
    score += min(22, len(text) // 10)
    has_product = bool(_STRONG_BANNER_RE.search(text) or _STRONG_BANNER_RE.search(title or ""))
    has_version = bool(_VERSION_RE.search(text))
    has_cpe = bool(_CPE_RE.search(text))
    if has_product:
        score += 9
    if has_version:
        score += 8
    if has_cpe:
        score += 5
    if re.search(r"(?i)(cipher|certificate|plugin|template|qod|module)", text):
        score += 5
    label = (
        "Rich service banner" if score >= 28
        else "Partial banner" if score >= 15
        else "Thin evidence text"
    )
    return _Factor(label, min(40, score), "observation")


def _version_factors(entity, version_agreement, checks) -> list[_Factor]:
    version = (entity.version if entity else "") or (
        version_agreement.canonical if version_agreement else ""
    )
    if not version:
        if checks.get("version_matches"):
            return [_Factor("Version flagged without parseable string", 8, "observation")]
        return [_Factor("No version identified", -6, "observation", "negative")]
    parts = version.split(".")
    certainty = 6 + min(15, len(parts) * 5)
    if _PATCH_RE.search(version):
        certainty += 5
    if checks.get("version_matches"):
        certainty += 4
    out = [_Factor(f"Version {version} identified", min(26, certainty), "observation")]
    if version_agreement and len(version_agreement.observed) > 1:
        out.append(_Factor("Version disagreement across scanners", -8, "observation", "negative"))
    return out


def _agreement_factor(agreement) -> _Factor:
    if not agreement or not agreement.capable:
        return _Factor("Single capable detector", 3, "observation")
    n_agreed = len(agreement.agreed)
    n_capable = len(agreement.capable)
    if n_capable <= 1 and n_agreed <= 1:
        return _Factor("Single capable detector", 3, "observation")
    ratio = agreement.ratio or (n_agreed / max(n_capable, 1))
    delta = int(round(ratio * 28)) - (4 if ratio < 0.5 else 0)
    return _Factor(f"Scanner agreement {agreement.label}", delta, "observation",
                   "negative" if delta < 0 else "positive")


def _reliability_factors(quality: AggregateQuality) -> list[_Factor]:
    """Confidence contributions from evidence *quality* (Priority 4 → 9).

    Trust flows from the strongest evidence backing the finding, adjusted for
    authentication, corroboration, reproducibility, and spoofability.
    """
    out: list[_Factor] = []
    if not quality.items:
        return [_Factor("No classified evidence", -8, "reliability", "negative")]

    best = max(quality.items, key=lambda q: q.reliability)
    # Anchor: distance of the strongest evidence from a neutral 0.5.
    anchor = int(round((best.reliability - 0.5) * 60))
    out.append(
        _Factor(
            f"{best.reliability_tier} evidence: {_type_label(best.evidence_type)}",
            anchor,
            "reliability",
            "negative" if anchor < 0 else "positive",
        )
    )

    if quality.authenticated:
        out.append(_Factor("Authenticated verification", 12, "reliability"))

    reliable_sources = [q for q in quality.items if q.reliability >= 0.6]
    distinct = {q.source_tool for q in reliable_sources}
    if len(distinct) >= 2:
        out.append(
            _Factor(
                f"Corroborated by {len(distinct)} reliable sources",
                min(16, (len(distinct) - 1) * 8),
                "reliability",
            )
        )

    if quality.reproducible:
        out.append(_Factor("Reproducible evidence", 9, "reliability"))

    if quality.min_spoofability == "high":
        out.append(_Factor("Highly spoofable evidence", -12, "reliability", "negative"))
    elif quality.min_spoofability == "medium":
        out.append(_Factor("Moderately spoofable evidence", -4, "reliability", "negative"))

    if all(q.freshness == "stale" for q in quality.items):
        out.append(_Factor("Stale evidence", -6, "reliability", "negative"))

    return out


def _type_label(evidence_type: str) -> str:
    return evidence_type.replace("_", " ")


def _false_positive_factor(body: str, title: str) -> _Factor | None:
    blob = f"{title} {body}"
    if _FP_RE.search(blob):
        return _Factor("False-positive indicator", -22, "observation", "negative")
    if re.search(r"(?i)\btcpwrapped\b", blob):
        return _Factor("tcpwrapped / opaque service", -16, "observation", "negative")
    if re.search(r"(?i)\bnping\b|echo reply", blob):
        return _Factor("Connectivity probe only", -10, "observation", "negative")
    return None


def _epss_kev(finding: CorrelatedFinding) -> tuple[float | None, bool]:
    epss: float | None = None
    kev = False
    for f in finding.findings or []:
        data = getattr(f, "__dict__", {}) or {}
        val = data.get("epss")
        if val is not None:
            try:
                epss = float(val)
            except (TypeError, ValueError):
                pass
        if data.get("kev") or data.get("known_exploited"):
            kev = True
    return epss, kev


# --------------------------------------------------------------------------- #
# Assembly
# --------------------------------------------------------------------------- #
def _assemble(
    factors: list[_Factor],
    *,
    kind: str,
    finding: CorrelatedFinding,
    checks: dict[str, bool],
    quality: AggregateQuality,
) -> ConfidenceResult:
    obs = [f for f in factors if f.category == "observation"]
    rel = [f for f in factors if f.category == "reliability"]
    exp = [f for f in factors if f.category == "exploit"]
    imp = [f for f in factors if f.category == "impact"]

    observation = _clamp(sum(f.delta for f in obs))
    reliability = _clamp(sum(f.delta for f in rel)) if rel else 0
    exploit = _clamp(sum(f.delta for f in exp)) if exp else 0
    impact = _clamp(sum(f.delta for f in imp)) if imp else 0

    # Evidence-weighted overall — dimensions with no evidence carry no weight.
    weights: list[tuple[int, float]] = [(observation, 0.34)]
    if rel:
        weights.append((reliability, 0.24))
    if exp:
        weights.append((exploit, 0.24))
    if imp:
        weights.append((impact, 0.18))
    total_w = sum(w for _, w in weights)
    overall = _clamp(sum(score * w for score, w in weights) / total_w) if total_w else observation

    dimensions = ["observation"]
    if rel:
        dimensions.append("reliability")
    if exp:
        dimensions.append("exploit")
    if imp:
        dimensions.append("impact")

    factor_map: dict[str, list[dict[str, Any]]] = {
        "observation": [f.as_dict() for f in obs],
        "reliability": [f.as_dict() for f in rel],
        "exploit": [f.as_dict() for f in exp],
        "impact": [f.as_dict() for f in imp],
        "overall": [f.as_dict() for f in sorted(factors, key=lambda x: x.delta, reverse=True)],
    }

    positives = sorted([f for f in factors if f.delta > 0], key=lambda f: f.delta, reverse=True)
    negatives = sorted([f for f in factors if f.delta < 0], key=lambda f: f.delta)
    supporting = [f"{f.label} (+{f.delta})" for f in positives[:6]]
    contradicting = [f"{f.label} ({f.delta})" for f in negatives[:5]]
    missing = _missing_evidence(kind, checks, finding)

    return ConfidenceResult(
        observation=observation,
        reliability=reliability,
        exploit=exploit,
        impact=impact,
        overall=overall,
        factors=factor_map,
        dimensions=dimensions,
        supporting_evidence=supporting,
        contradicting_evidence=contradicting,
        missing_evidence=missing,
        kind=kind,
        evidence_quality=quality.as_dict(),
    )


def _missing_evidence(
    kind: str, checks: dict[str, bool], finding: CorrelatedFinding
) -> list[str]:
    missing: list[str] = []
    if kind in _NON_EXPLOITABLE_KINDS:
        return missing
    if finding.cve and not checks.get("cve_applicable"):
        missing.append("Targeted CVE applicability check against the observed version")
    if not checks.get("version_matches") and not (
        finding.canonical_entity and finding.canonical_entity.version
    ):
        missing.append("Independent version confirmation (banner or package check)")
    if not checks.get("reproducible"):
        missing.append("Controlled exploit reproduction")
    if not checks.get("privilege_escalation_possible"):
        missing.append("Evidence of privilege escalation on the affected host")
    if not checks.get("lateral_movement_possible"):
        missing.append("Evidence of lateral movement to a downstream target")
    return missing[:6]
