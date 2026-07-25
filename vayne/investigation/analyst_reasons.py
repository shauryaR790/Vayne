"""Deterministic, analyst-facing reason lines for priority / attention cards.

Never emit internal scoring labels like ``model=observation_confidence``.
Reasons must be actionable: what was observed, by whom, and why it matters.
"""

from __future__ import annotations

import re
from typing import Any

_INTERNAL_REASON = re.compile(
    r"(?i)"
    r"model\s*=|"
    r"confidence_model\s*=|"
    r"observation_confidence|"
    r"confidence\s*=\s*round|"
    r"evidence class:|"
    r"composite score|"
    r"\(\+\d+\)|"
    r"\(-\d+\)|"
    r"\(\d+/100\)|"
    r"spoofable evidence|"
    r"version flagged without|"
    r"moderately spoofable"
)

_SCANNER_LABELS = {
    "nmap": "Nmap",
    "nessus": "Nessus",
    "openvas": "OpenVAS",
    "nuclei": "Nuclei",
    "burp": "Burp",
    "burpsuite": "Burp",
    "burp suite": "Burp",
    "bloodhound": "BloodHound",
    "metasploit": "Metasploit",
    "masscan": "Masscan",
    "zap": "ZAP",
    "acunetix": "Acunetix",
    "qualys": "Qualys",
    "rapid7": "Rapid7",
    "insightvm": "InsightVM",
    "nikto": "Nikto",
}


def is_internal_reason(text: str) -> bool:
    """True when a string is an engine scoring dump, not analyst copy."""
    cleaned = str(text or "").strip()
    if not cleaned:
        return True
    if _INTERNAL_REASON.search(cleaned):
        return True
    if "×" in cleaned and "scanner" in cleaned.lower():
        return True
    if cleaned.lower().startswith("round("):
        return True
    return False


def pretty_scanner(name: str) -> str:
    raw = str(name or "").strip()
    if not raw:
        return ""
    key = raw.lower().replace("_", " ").strip()
    if key in _SCANNER_LABELS:
        return _SCANNER_LABELS[key]
    base = key.split("/")[-1].split("\\")[-1]
    stem = base.split(".")[0]
    if stem in _SCANNER_LABELS:
        return _SCANNER_LABELS[stem]
    return raw[:40]


def _unique(lines: list[str], *, limit: int = 6) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        text = str(line or "").strip()
        if not text or is_internal_reason(text):
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
        if len(out) >= limit:
            break
    return out


def build_analyst_reasons(
    *,
    title: str = "",
    cve: str = "",
    sources: list[str] | None = None,
    evidence: list[str] | None = None,
    validation: Any = None,
    quality: dict[str, Any] | None = None,
    scanner_agreement: Any = None,
    version_agreement: Any = None,
    on_path: bool = False,
    host_count: int = 1,
    severity: str = "",
) -> list[str]:
    """Build short deterministic reasons for any finding / investigation card."""
    reasons: list[str] = []
    quality = quality or {}
    title_l = str(title or "").lower()
    sev = str(severity or "").lower()

    scanners = [pretty_scanner(s) for s in (sources or []) if str(s).strip()]
    scanners = [s for s in scanners if s]
    seen_s: set[str] = set()
    scanners = [s for s in scanners if not (s.lower() in seen_s or seen_s.add(s.lower()))]

    agreed: list[str] = []
    ratio = 0.0
    if scanner_agreement is not None:
        agreed = [
            pretty_scanner(s)
            for s in (getattr(scanner_agreement, "agreed", None) or [])
            if str(s).strip()
        ]
        agreed = [s for s in agreed if s]
        ratio = float(getattr(scanner_agreement, "ratio", 0) or 0)

    if len(scanners) >= 2:
        reasons.append(f"Corroborated by {', '.join(scanners[:4])}")
    elif len(scanners) == 1:
        reasons.append(f"Observed by {scanners[0]}")

    named = " ".join(reasons).lower()
    for tool in agreed:
        if tool.lower() not in named:
            reasons.append(f"Confirmed by {tool}")
            named = " ".join(reasons).lower()

    if ratio >= 0.67 and max(len(agreed), len(scanners)) >= 2:
        reasons.append("High scanner agreement")

    if validation is not None:
        if getattr(validation, "service_fingerprinted", False) or getattr(
            validation, "service_exists", False
        ):
            reasons.append("Banner identified")
        if getattr(validation, "version_matches", False):
            reasons.append("Version parsed")
        if getattr(validation, "cve_applicable", False):
            reasons.append("Version vulnerable")
        elif cve:
            reasons.append("Version vulnerable")

    va = version_agreement
    if va is not None:
        if getattr(va, "canonical", None) or getattr(va, "observed", None):
            if "Version parsed" not in reasons:
                reasons.append("Version parsed")
        if getattr(va, "agreed", False) and "Banner identified" not in reasons:
            reasons.append("Banner identified")

    ev_blob = " ".join(str(e) for e in (evidence or [])).lower()
    if "banner" in ev_blob and "Banner identified" not in reasons:
        reasons.append("Banner identified")
    if ("version" in ev_blob or re.search(r"\d+\.\d+", ev_blob)) and "Version parsed" not in reasons:
        if any(k in title_l for k in ("http", "apache", "nginx", "ssh", "mysql", "openssl")):
            reasons.append("Version parsed")

    if cve and "Version vulnerable" not in reasons:
        cve_s = str(cve).strip()
        if cve_s.upper().startswith("CVE"):
            reasons.append(f"CVE matched ({cve_s})")
        else:
            reasons.append("CVE matched")

    if on_path:
        reasons.append("On a surviving attack path")

    if quality.get("internet_exposure", 0) >= 60:
        reasons.append("Internet-facing")

    exploit = int(quality.get("exploitability", 0) or 0)
    if exploit >= 60:
        reasons.append("Exploit evidence present")
    elif not cve and not on_path and exploit < 40:
        reasons.append("No exploit evidence")

    if len(scanners) <= 1 and not on_path and ratio < 0.67:
        reasons.append("Single-source observation")

    if host_count > 1:
        reasons.append(f"Repeated across {host_count} hosts")

    if any(k in title_l for k in ("secret", "credential", "password", "api key", "token")):
        reasons.append("Exposed secret/credential material")
    if "injection" in title_l:
        reasons.append("Injection signal — confirm input path")
    if "mfa" in title_l or "multi-factor" in title_l:
        reasons.append("Authentication weakness — confirm MFA")
    if "traversal" in title_l:
        reasons.append("Directory traversal signal")

    if sev in ("critical", "high") and not any(
        "CVE" in r or "vulnerable" in r.lower() for r in reasons
    ):
        reasons.append(f"{sev.capitalize()} severity finding")

    out = _unique(reasons, limit=6)
    return out or ["Needs analyst review"]


def build_analyst_reasons_from_engine_item(
    item: Any,
    quality: dict[str, Any] | None = None,
    *,
    on_path: bool = False,
    host_count: int = 1,
) -> list[str]:
    """Reasons from an InvestigatedFinding-like engine object."""
    corr = item.correlated
    sources = list(getattr(corr, "sources", None) or [])
    if not sources:
        for raw in getattr(corr, "findings", None) or []:
            tool = getattr(raw, "source_tool", None) or ""
            if tool:
                sources.append(str(tool))
    return build_analyst_reasons(
        title=str(getattr(corr, "title", "") or ""),
        cve=str(getattr(corr, "cve", "") or ""),
        sources=sources,
        evidence=list(getattr(corr, "evidence", None) or []),
        validation=getattr(item, "validation", None),
        quality=quality or {},
        scanner_agreement=getattr(corr, "scanner_agreement", None),
        version_agreement=getattr(corr, "version_agreement", None),
        on_path=on_path,
        host_count=host_count,
        severity=str(getattr(corr, "severity", "") or ""),
    )


def build_analyst_reasons_from_finding_dict(
    finding: dict[str, Any],
    *,
    path: dict[str, Any] | None = None,
    sources: list[str] | None = None,
) -> list[str]:
    """Reasons from a serialized finding / cluster member dict."""
    src = list(sources or [])
    if not src:
        src = list(finding.get("sources") or finding.get("evidence_sources") or [])
    conf = finding.get("confidence") if isinstance(finding.get("confidence"), dict) else {}
    quality = {
        "internet_exposure": int(
            finding.get("internet_exposure")
            or conf.get("internet_exposure")
            or (80 if finding.get("internet_facing") else 0)
            or 0
        ),
        "exploitability": int(
            finding.get("exploitability") or conf.get("exploitability") or 0
        ),
    }
    on_path = bool(path and path.get("status") == "VALIDATED")
    host_n = len(finding.get("hosts") or finding.get("affected_assets") or []) or 1
    return build_analyst_reasons(
        title=str(finding.get("title") or ""),
        cve=str(finding.get("cve") or ""),
        sources=src,
        evidence=list(finding.get("evidence") or []),
        quality=quality,
        on_path=on_path,
        host_count=max(1, host_n),
        severity=str(finding.get("severity") or ""),
    )


def format_reason_line(reasons: list[str], *, sep: str = " · ") -> str:
    """Single-line fallback for UIs that still expect one string."""
    cleaned = _unique(reasons, limit=6)
    return sep.join(cleaned) if cleaned else "Needs analyst review"
