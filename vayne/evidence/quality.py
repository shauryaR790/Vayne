"""Evidence Quality Engine (Priority 4).

Every piece of scanner evidence is classified by *how much we should trust it*.
An authenticated Nessus plugin result and a reverse-DNS guess are not the same
kind of fact, and confidence must reflect that.

Each evidence object exposes:

* ``evidence_type``        — what kind of observation this is
* ``reliability``          — 0-1 trust score for the evidence type
* ``reliability_tier``     — Very High / High / Medium / Low / Very Low
* ``verification_strength``— verified / corroborated / observed / inferred
* ``authentication_level`` — authenticated / unauthenticated
* ``spoofability``         — low / medium / high (how easily forged)
* ``reproducibility``      — high / medium / low
* ``freshness``            — fresh / recent / stale / unknown
* ``source_reputation``    — 0-1 reputation of the producing scanner
* ``confidence_quality``   — composite 0-1 quality used to weight confidence

Deterministic and derived only from the evidence itself — no defaults that hide
missing data.
"""

from __future__ import annotations

import re
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from vayne.models import Finding


class ReliabilityTier(str, Enum):
    VERY_HIGH = "Very High"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"
    VERY_LOW = "Very Low"


@dataclass
class EvidenceType:
    key: str
    reliability: float
    tier: ReliabilityTier
    verification_strength: str
    spoofability: str
    reproducibility: str


# The reliability hierarchy from Priority 4, made concrete. Higher = more trust.
_TYPES: dict[str, EvidenceType] = {
    "authenticated_nessus": EvidenceType("Authenticated Nessus result", 0.97, ReliabilityTier.VERY_HIGH, "verified", "low", "high"),
    "authenticated_openvas": EvidenceType("Authenticated OpenVAS result", 0.95, ReliabilityTier.VERY_HIGH, "verified", "low", "high"),
    "burp_replay": EvidenceType("Burp replay", 0.95, ReliabilityTier.VERY_HIGH, "verified", "low", "high"),
    "http_replay": EvidenceType("HTTP replay", 0.88, ReliabilityTier.HIGH, "verified", "low", "high"),
    "nmap_nse": EvidenceType("Nmap NSE verification", 0.85, ReliabilityTier.HIGH, "corroborated", "low", "high"),
    "version_fingerprint": EvidenceType("Version fingerprint", 0.82, ReliabilityTier.HIGH, "corroborated", "low", "high"),
    "nuclei_template": EvidenceType("Nuclei template match", 0.78, ReliabilityTier.HIGH, "corroborated", "medium", "high"),
    "service_fingerprint": EvidenceType("Service fingerprint", 0.68, ReliabilityTier.MEDIUM, "observed", "medium", "medium"),
    "banner_string": EvidenceType("Banner string", 0.60, ReliabilityTier.MEDIUM, "observed", "medium", "medium"),
    "http_title": EvidenceType("HTTP title", 0.40, ReliabilityTier.LOW, "inferred", "high", "low"),
    "server_header": EvidenceType("Server header", 0.38, ReliabilityTier.LOW, "inferred", "high", "low"),
    "reverse_dns": EvidenceType("Reverse DNS", 0.20, ReliabilityTier.VERY_LOW, "inferred", "high", "low"),
    "tcp_fingerprint": EvidenceType("TCP fingerprint", 0.18, ReliabilityTier.VERY_LOW, "inferred", "high", "low"),
    "unknown_template": EvidenceType("Unknown template match", 0.22, ReliabilityTier.VERY_LOW, "inferred", "high", "low"),
    "generic": EvidenceType("Scanner observation", 0.50, ReliabilityTier.MEDIUM, "observed", "medium", "medium"),
}

# Independent scanner reputation (distinct from Phase-1 path scanner_reliability).
_SOURCE_REPUTATION: dict[str, float] = {
    "nessus": 0.93,
    "openvas": 0.88,
    "burp": 0.90,
    "nuclei": 0.82,
    "nmap": 0.90,
    "httpx": 0.80,
    "naabu": 0.72,
    "katana": 0.68,
    "exploit_intel": 0.95,
}

_AUTH_RE = re.compile(r"(?i)authenticated|credentialed|logged.?in|local\s?check|creds?\b")
_REPLAY_RE = re.compile(r"(?i)replay|reproduc|resent|re-?issued request|round-?trip")
_NSE_RE = re.compile(r"(?i)-vuln|nse|script[- ]?id|\bhttp-[a-z]+\b|smb-|ssl-enum|ftp-")
_SERVER_HEADER_RE = re.compile(r"(?i)^server:\s|\bserver header\b")
_HTTP_TITLE_RE = re.compile(r"(?i)http[-_ ]?title|<title>|page title")
_REVDNS_RE = re.compile(r"(?i)reverse dns|ptr record|rdns")
_TCP_FP_RE = re.compile(r"(?i)tcp fingerprint|os fingerprint|ttl=|window size|tcpwrapped")
_VERSION_RE = re.compile(r"(?<![\w.])\d+\.\d+(?:\.\d+){0,3}")
_CPE_RE = re.compile(r"cpe:/[aoh]:", re.I)
_STRONG_PRODUCT_RE = re.compile(
    r"(?i)(openssh|apache|nginx|iis|vsftpd|proftpd|mysql|mariadb|postgres|redis|"
    r"mongodb|jenkins|tomcat|samba|bind|exchange|grafana)"
)


@dataclass
class EvidenceQuality:
    evidence_id: str
    source_tool: str
    evidence_type: str
    reliability: float
    reliability_tier: str
    verification_strength: str
    authentication_level: str
    spoofability: str
    reproducibility: str
    freshness: str
    source_reputation: float
    confidence_quality: float
    rationale: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "evidence_id": self.evidence_id,
            "source_tool": self.source_tool,
            "evidence_type": self.evidence_type,
            "reliability": round(self.reliability, 3),
            "reliability_tier": self.reliability_tier,
            "verification_strength": self.verification_strength,
            "authentication_level": self.authentication_level,
            "spoofability": self.spoofability,
            "reproducibility": self.reproducibility,
            "freshness": self.freshness,
            "source_reputation": round(self.source_reputation, 3),
            "confidence_quality": round(self.confidence_quality, 3),
            "rationale": self.rationale,
        }


def _detect_type(tool: str, text: str) -> str:
    t = (tool or "").lower()
    authenticated = bool(_AUTH_RE.search(text))
    if authenticated and t == "nessus":
        return "authenticated_nessus"
    if authenticated and t == "openvas":
        return "authenticated_openvas"
    if t == "burp":
        return "burp_replay"
    if _REPLAY_RE.search(text):
        return "http_replay"
    if t == "nmap" and _NSE_RE.search(text):
        return "nmap_nse"
    if t == "nuclei":
        # A template that names a real product/version is far stronger than an
        # opaque template-id-only match.
        if _STRONG_PRODUCT_RE.search(text) or _CPE_RE.search(text):
            return "nuclei_template"
        return "unknown_template"
    if _TCP_FP_RE.search(text):
        return "tcp_fingerprint"
    if _REVDNS_RE.search(text):
        return "reverse_dns"
    if _SERVER_HEADER_RE.search(text):
        return "server_header"
    if _HTTP_TITLE_RE.search(text):
        return "http_title"
    if _CPE_RE.search(text) or (_STRONG_PRODUCT_RE.search(text) and _VERSION_RE.search(text)):
        return "version_fingerprint"
    if _STRONG_PRODUCT_RE.search(text):
        return "service_fingerprint"
    if t == "nessus" or t == "openvas":
        # Unauthenticated but plugin-backed: treat as service fingerprint tier.
        return "service_fingerprint"
    if text.strip():
        return "banner_string"
    return "generic"


def _freshness(finding: Finding) -> str:
    ts = getattr(finding, "timestamp", None)
    if not isinstance(ts, datetime):
        return "unknown"
    now = datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    age_days = (now - ts).total_seconds() / 86400.0
    if age_days <= 1:
        return "fresh"
    if age_days <= 30:
        return "recent"
    return "stale"


_SPOOF_PENALTY = {"low": 0.0, "medium": 0.08, "high": 0.2}


def classify_evidence(finding: Finding) -> EvidenceQuality:
    tool = (finding.source_tool or "").lower()
    text = " ".join(
        s for s in (finding.title, finding.evidence, finding.description, finding.service) if s
    )
    et_key = _detect_type(tool, text)
    et = _TYPES.get(et_key, _TYPES["generic"])

    authenticated = et_key.startswith("authenticated_")
    auth_level = "authenticated" if authenticated else "unauthenticated"
    reputation = _SOURCE_REPUTATION.get(tool, 0.6)
    freshness = _freshness(finding)

    # Composite quality: reliability anchored, adjusted by reputation, spoof
    # risk, authentication, and freshness. Every term is bounded and named in
    # the rationale so the score is fully traceable.
    quality = et.reliability
    quality *= 0.85 + 0.15 * reputation  # reputable scanners lend credibility
    quality -= _SPOOF_PENALTY.get(et.spoofability, 0.08)
    if authenticated:
        quality += 0.03
    if freshness == "stale":
        quality -= 0.05
    quality = max(0.05, min(1.0, quality))

    rationale = (
        f"{et.key} via {tool or 'scan'}; {auth_level}; "
        f"spoofability={et.spoofability}; reproducibility={et.reproducibility}; "
        f"reputation={reputation:.2f}"
    )

    return EvidenceQuality(
        evidence_id=finding.id or "",
        source_tool=tool,
        evidence_type=et.key,
        reliability=et.reliability,
        reliability_tier=et.tier.value,
        verification_strength=et.verification_strength,
        authentication_level=auth_level,
        spoofability=et.spoofability,
        reproducibility=et.reproducibility,
        freshness=freshness,
        source_reputation=reputation,
        confidence_quality=quality,
        rationale=rationale,
    )


_STRENGTH_RANK = {"verified": 4, "corroborated": 3, "observed": 2, "inferred": 1}
_TIER_ORDER = [
    ReliabilityTier.VERY_LOW,
    ReliabilityTier.LOW,
    ReliabilityTier.MEDIUM,
    ReliabilityTier.HIGH,
    ReliabilityTier.VERY_HIGH,
]


@dataclass
class AggregateQuality:
    items: list[EvidenceQuality]
    best_reliability: float
    best_tier: str
    strongest_verification: str
    authenticated: bool
    min_spoofability: str
    reproducible: bool
    mean_quality: float
    best_quality: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "best_reliability": round(self.best_reliability, 3),
            "best_tier": self.best_tier,
            "strongest_verification": self.strongest_verification,
            "authenticated": self.authenticated,
            "min_spoofability": self.min_spoofability,
            "reproducible": self.reproducible,
            "mean_quality": round(self.mean_quality, 3),
            "best_quality": round(self.best_quality, 3),
            "evidence": [q.as_dict() for q in self.items],
        }


# Bounded memoization: aggregate_quality is recomputed for the same finding set
# by the confidence, hypothesis, self-challenge, reasoning, and investigation
# stages. Caching collapses those to a single classification pass, which is the
# dominant per-finding cost at scale (50k findings / 10k hosts).
_AGG_CACHE: "OrderedDict[tuple, AggregateQuality]" = OrderedDict()
_AGG_CACHE_MAX = 20000


def _agg_key(findings: list[Finding]) -> tuple:
    return tuple(
        (
            f.id,
            f.source_tool or "",
            f.title or "",
            f.evidence or "",
            f.description or "",
            f.service or "",
            f.timestamp.isoformat() if isinstance(getattr(f, "timestamp", None), datetime) else "",
        )
        for f in findings
    )


def aggregate_quality(findings: list[Finding]) -> AggregateQuality:
    """Aggregate the quality of all raw evidence backing a correlated finding."""
    key = _agg_key(findings)
    cached = _AGG_CACHE.get(key)
    if cached is not None:
        _AGG_CACHE.move_to_end(key)
        return cached
    result = _aggregate_quality_uncached(findings)
    _AGG_CACHE[key] = result
    if len(_AGG_CACHE) > _AGG_CACHE_MAX:
        _AGG_CACHE.popitem(last=False)
    return result


def _aggregate_quality_uncached(findings: list[Finding]) -> AggregateQuality:
    items = [classify_evidence(f) for f in findings] or []
    if not items:
        return AggregateQuality(
            items=[], best_reliability=0.0, best_tier=ReliabilityTier.VERY_LOW.value,
            strongest_verification="inferred", authenticated=False,
            min_spoofability="high", reproducible=False, mean_quality=0.0, best_quality=0.0,
        )
    best = max(items, key=lambda q: q.reliability)
    strongest = max(items, key=lambda q: _STRENGTH_RANK.get(q.verification_strength, 0))
    spoof_rank = {"low": 0, "medium": 1, "high": 2}
    min_spoof = min(items, key=lambda q: spoof_rank.get(q.spoofability, 2)).spoofability
    return AggregateQuality(
        items=items,
        best_reliability=best.reliability,
        best_tier=best.reliability_tier,
        strongest_verification=strongest.verification_strength,
        authenticated=any(q.authentication_level == "authenticated" for q in items),
        min_spoofability=min_spoof,
        reproducible=any(q.reproducibility == "high" for q in items) or len(items) >= 2,
        mean_quality=sum(q.confidence_quality for q in items) / len(items),
        best_quality=max(q.confidence_quality for q in items),
    )
