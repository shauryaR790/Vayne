"""Evidence Primitives (Priority 4 — Replace Scanner Thinking).

The engine stops thinking in scanner names (Nmap / Nessus / OpenVAS) and starts
thinking in the *evidence* those tools produced: TCP SYN, Banner, TLS,
Certificate, HTTP Response, Authentication, Fingerprint, Version, Exploit,
Replay, Credential, Log. Scanner names are retained only as metadata on each
primitive.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from vayne.correlator.normalization import extract_version
from vayne.evidence.quality import classify_evidence
from vayne.models import CorrelatedFinding, Finding

# Ordered so a reconstructed chain reads network → application → validation.
PRIMITIVE_ORDER = [
    "tcp_syn", "banner", "tls", "certificate", "http_response", "fingerprint",
    "version", "cve", "exploit", "authentication", "replay", "credential", "log",
]

_DISPLAY = {
    "tcp_syn": "TCP SYN",
    "banner": "Banner",
    "tls": "TLS",
    "certificate": "Certificate",
    "http_response": "HTTP Response",
    "fingerprint": "Fingerprint",
    "version": "Version",
    "cve": "CVE",
    "exploit": "Exploit",
    "authentication": "Authentication",
    "replay": "Replay",
    "credential": "Credential",
    "log": "Log",
}

_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("tcp_syn", re.compile(r"(?i)\bsyn\b|open port|port (?:is )?open|/tcp\s+open|portscan")),
    ("banner", re.compile(r"(?i)banner|server:\s|ssh-\d|220 |smtp|ftp server")),
    ("tls", re.compile(r"(?i)\btls\b|\bssl\b|cipher|handshake|starttls")),
    ("certificate", re.compile(r"(?i)certificate|x509|subject:|issuer:|\bcn=|not valid after")),
    ("http_response", re.compile(r"(?i)http/1|http/2|status code|http-title|<title>|response header|\bwww-|location:")),
    ("fingerprint", re.compile(r"(?i)fingerprint|service detection|probe matched|nse|-vuln")),
    ("authentication", re.compile(r"(?i)authenticated|credentialed|logged.?in|local\s?check")),
    ("replay", re.compile(r"(?i)replay|reproduc|resent|round-?trip")),
    ("credential", re.compile(r"(?i)credential|password|default login|anonymous login|weak auth")),
    ("log", re.compile(r"(?i)\blog\b|access\.log|error\.log|syslog|event id")),
    ("exploit", re.compile(r"(?i)exploit|metasploit|\bpoc\b|payload|remote code")),
]


@dataclass
class EvidencePrimitive:
    type: str
    display: str
    detail: str
    source_tool: str  # scanner name is now just metadata
    reliability_tier: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "display": self.display,
            "detail": self.detail,
            "source_tool": self.source_tool,
            "reliability_tier": self.reliability_tier,
        }


def _primitives_for_finding(finding: Finding) -> list[EvidencePrimitive]:
    q = classify_evidence(finding)
    text = " ".join(s for s in (finding.title, finding.evidence, finding.description, finding.service) if s)
    found: dict[str, EvidencePrimitive] = {}

    for ptype, pattern in _PATTERNS:
        m = pattern.search(text)
        if m:
            snippet = _snippet(text, m.start())
            found[ptype] = EvidencePrimitive(
                ptype, _DISPLAY[ptype], snippet, finding.source_tool or "", q.reliability_tier
            )

    if finding.port:
        found.setdefault(
            "tcp_syn",
            EvidencePrimitive("tcp_syn", _DISPLAY["tcp_syn"], f"port {finding.port} observed",
                              finding.source_tool or "", q.reliability_tier),
        )
    if extract_version(finding.title, finding.service, finding.evidence):
        found.setdefault(
            "version",
            EvidencePrimitive("version", _DISPLAY["version"],
                              extract_version(finding.title, finding.service, finding.evidence),
                              finding.source_tool or "", q.reliability_tier),
        )
    if finding.cve:
        found.setdefault(
            "cve",
            EvidencePrimitive("cve", _DISPLAY["cve"], finding.cve,
                              finding.source_tool or "", q.reliability_tier),
        )
    return list(found.values())


def _snippet(text: str, start: int, width: int = 60) -> str:
    lo = max(0, start - 4)
    return text[lo:lo + width].strip()


def primitives_for(finding: CorrelatedFinding) -> list[dict[str, Any]]:
    """Deduplicated, ordered evidence primitives backing a correlated finding."""
    by_type: dict[str, EvidencePrimitive] = {}
    for raw in finding.findings or []:
        for prim in _primitives_for_finding(raw):
            existing = by_type.get(prim.type)
            # Keep the strongest-tier example of each primitive type.
            if existing is None or _tier_rank(prim.reliability_tier) > _tier_rank(existing.reliability_tier):
                by_type[prim.type] = prim
    ordered = sorted(
        by_type.values(),
        key=lambda p: PRIMITIVE_ORDER.index(p.type) if p.type in PRIMITIVE_ORDER else 99,
    )
    return [p.as_dict() for p in ordered]


_TIER_RANK = {"Very Low": 0, "Low": 1, "Medium": 2, "High": 3, "Very High": 4}


def _tier_rank(tier: str) -> int:
    return _TIER_RANK.get(tier, 0)
