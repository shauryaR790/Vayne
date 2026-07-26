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


# ---------------------------------------------------------------------------
# Attention Queue — one card = one actionable investigation
# ---------------------------------------------------------------------------

_THEME_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"directory.?traversal|path.?traversal|lfi|rfi", re.I), "traversal"),
    (re.compile(r"\brce\b|remote.?code|command.?inject", re.I), "rce"),
    (re.compile(r"sql.?inject|sqli", re.I), "sqli"),
    (re.compile(r"xss|cross.?site", re.I), "xss"),
    (re.compile(r"credential|password|secret|api.?key|token|private.?key", re.I), "credential"),
    (re.compile(r"\bmfa\b|multi.?factor|2fa", re.I), "mfa"),
    (re.compile(r"anonymous.?ftp|ftp.*anon", re.I), "anon_ftp"),
    (re.compile(r"redis|unauth|no.?auth|authentication.?bypass", re.I), "unauth"),
    (re.compile(r"s3|bucket|public.?object", re.I), "cloud_exposure"),
    (re.compile(r"iam|assume.?role|privilege", re.I), "iam"),
    (re.compile(r"jenkins", re.I), "jenkins"),
    (re.compile(r"outdated|end.?of.?life|eol|unsupported", re.I), "outdated"),
]


def file_basename(path: str) -> str:
    """Return the upload filename without directory noise."""
    raw = str(path or "").strip().replace("\\", "/")
    if not raw:
        return ""
    return raw.rsplit("/", 1)[-1]


def attention_theme(title: str = "", cve: str = "", evidence: list[str] | None = None) -> str:
    blob = f"{title} {cve} {' '.join(str(e) for e in (evidence or []))}"
    for pattern, theme in _THEME_PATTERNS:
        if pattern.search(blob):
            return theme
    if str(cve or "").strip():
        return "cve"
    return "general"


def attention_subject(item: Any) -> str:
    """Human subject for the card (product/service), not a raw CVE string."""
    corr = getattr(item, "correlated", item)
    entity = getattr(corr, "canonical_entity", None)
    if entity is not None:
        label = str(getattr(entity, "label", "") or "").strip()
        if label:
            return label[:80]
        product = str(getattr(entity, "product", "") or "").strip()
        vendor = str(getattr(entity, "vendor", "") or "").strip()
        version = str(getattr(entity, "version", "") or "").strip()
        if product:
            bits = [p for p in (vendor, product, version) if p]
            return " ".join(bits)[:80]
    service = str(getattr(corr, "service", "") or "").strip()
    if service:
        return service[:80]
    title = str(getattr(corr, "title", "") or "").strip()
    # Prefer product-ish prefix before punctuation.
    for sep in (":", " - ", " — ", " | "):
        if sep in title:
            left = title.split(sep, 1)[0].strip()
            if left and not left.upper().startswith("CVE"):
                return left[:80]
    return (title or "Investigation")[:80]


def attention_group_key(item: Any) -> str:
    """Merge related evidence into one investigation before prioritization."""
    corr = getattr(item, "correlated", item)
    host = str(getattr(corr, "host", "") or "").strip().lower() or "_"
    cve = str(getattr(corr, "cve", "") or "").strip().upper()
    evidence = list(getattr(corr, "evidence", None) or [])
    title = str(getattr(corr, "title", "") or "")
    theme = attention_theme(title, cve, evidence)

    entity = getattr(corr, "canonical_entity", None)
    entity_key = ""
    if entity is not None:
        entity_key = str(getattr(entity, "key", "") or "").strip().lower()
        if not entity_key:
            product = str(getattr(entity, "product", "") or "").strip().lower()
            service = str(getattr(entity, "service", "") or "").strip().lower()
            entity_key = product or service

    if cve:
        # Same CVE on the same host is one investigation, even if titles differ.
        return f"{host}|cve:{cve}"
    if entity_key and theme != "general":
        return f"{host}|ent:{entity_key}|{theme}"
    if entity_key:
        return f"{host}|ent:{entity_key}"
    service = str(getattr(corr, "service", "") or "").strip().lower()
    if service and theme != "general":
        return f"{host}|svc:{service}|{theme}"
    return f"{host}|theme:{theme}|{_normalize_title_slug(title)}"


def _normalize_title_slug(title: str) -> str:
    parts = "".join(ch.lower() if ch.isalnum() else " " for ch in (title or "")).split()
    return "-".join(parts[:6]) if parts else "finding"


def collect_source_files(*items: Any) -> list[str]:
    """Exact uploaded filenames that produced evidence for this investigation."""
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        corr = getattr(item, "correlated", item)
        candidates: list[str] = []
        for sf in getattr(corr, "source_files", None) or []:
            candidates.append(str(sf))
        for raw in getattr(corr, "findings", None) or []:
            sf = getattr(raw, "source_file", None) or ""
            if sf:
                candidates.append(str(sf))
            # Nested dicts from serialized payloads
            if isinstance(raw, dict) and raw.get("source_file"):
                candidates.append(str(raw["source_file"]))
        for path in candidates:
            name = file_basename(path) or path.strip()
            if not name:
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(name)
    return out


def build_attention_evidence(*items: Any, limit: int = 6) -> list[dict[str, str]]:
    """Per-scanner evidence lines for the Attention Queue card."""
    rows: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(tool: str, detail: str) -> None:
        scanner = pretty_scanner(tool) or "Scanner"
        text = re.sub(r"\s+", " ", str(detail or "").strip())
        if not text or is_internal_reason(text):
            text = scanner
        text = text[:90]
        key = f"{scanner.lower()}|{text.lower()}"
        if key in seen:
            return
        seen.add(key)
        rows.append({"scanner": scanner, "detail": text})

    for item in items:
        corr = getattr(item, "correlated", item)
        raws = list(getattr(corr, "findings", None) or [])
        if raws:
            for raw in raws:
                if isinstance(raw, dict):
                    tool = str(raw.get("source_tool") or "")
                    detail = (
                        str(raw.get("cve") or "").strip()
                        or str(raw.get("evidence") or "").strip()
                        or str(raw.get("title") or "").strip()
                        or str(raw.get("service") or "").strip()
                    )
                else:
                    tool = str(getattr(raw, "source_tool", "") or "")
                    detail = (
                        str(getattr(raw, "cve", "") or "").strip()
                        or str(getattr(raw, "evidence", "") or "").strip()
                        or str(getattr(raw, "title", "") or "").strip()
                        or str(getattr(raw, "service", "") or "").strip()
                    )
                add(tool, detail)
                if len(rows) >= limit:
                    return rows
            continue

        # Fallback when raw findings were stripped: use correlated sources + evidence.
        sources = list(getattr(corr, "sources", None) or [])
        evidence = list(getattr(corr, "evidence", None) or [])
        cve = str(getattr(corr, "cve", "") or "").strip()
        title = str(getattr(corr, "title", "") or "").strip()
        if sources:
            for i, tool in enumerate(sources):
                detail = ""
                if i < len(evidence):
                    detail = str(evidence[i])
                elif cve and i == 0:
                    detail = cve
                elif title:
                    detail = title
                add(str(tool), detail)
                if len(rows) >= limit:
                    return rows
        elif evidence:
            for ev in evidence[:limit]:
                add("scan", str(ev))
                if len(rows) >= limit:
                    return rows

    return rows


def build_attention_required(
    *,
    title: str = "",
    cve: str = "",
    theme: str = "",
    on_path: bool = False,
    confirmed: bool = False,
) -> str:
    """Short claim answering: what needs my attention?"""
    theme = theme or attention_theme(title, cve)
    labels = {
        "traversal": "Directory Traversal",
        "rce": "Remote Code Execution",
        "sqli": "SQL Injection",
        "xss": "Cross-Site Scripting",
        "credential": "Exposed Credentials",
        "mfa": "Missing MFA",
        "anon_ftp": "Anonymous FTP Access",
        "unauth": "Unauthenticated Access",
        "cloud_exposure": "Public Cloud Exposure",
        "iam": "IAM Privilege Risk",
        "jenkins": "Jenkins Exposure",
        "outdated": "Outdated Service",
        "cve": "Known CVE Match",
    }
    label = labels.get(theme)
    if label:
        if confirmed or theme in ("traversal", "rce", "credential", "anon_ftp", "unauth"):
            suffix = " confirmed" if confirmed or theme != "outdated" else " identified"
            if theme == "outdated":
                return "Outdated service identified"
            if theme == "cve" and cve:
                return f"{cve} applicable"
            return f"{label} confirmed" if theme != "mfa" else f"{label} — confirm controls"
        return f"{label} identified"

    clean = re.sub(r"\s+", " ", str(title or "").strip())
    if cve and clean.upper().startswith("CVE"):
        return f"{cve} requires review"
    if clean:
        # Keep the claim short — strip host/IP noise if present.
        return clean[:90]
    if on_path:
        return "Attack-path step requires review"
    return "Needs analyst review"


def build_why_this_matters(
    *,
    scanners: list[str] | None = None,
    on_path: bool = False,
    cve: str = "",
    host_count: int = 1,
    exploit_evidence: bool = False,
    theme: str = "",
) -> str:
    """One short paragraph: why should the analyst care?"""
    tools = [pretty_scanner(s) for s in (scanners or []) if str(s).strip()]
    tools = [t for t in tools if t]
    # de-dupe preserving order
    seen: set[str] = set()
    tools = [t for t in tools if not (t.lower() in seen or seen.add(t.lower()))]

    if len(tools) >= 2:
        return (
            "Multiple scanners independently identified the same vulnerable service."
        )
    if on_path:
        return "This sits on a surviving attack path and can expand blast radius if left open."
    if exploit_evidence:
        return "Exploit evidence is present — treat as actionable until proven otherwise."
    if cve:
        return f"A known vulnerability ({cve}) matches the observed service fingerprint."
    if host_count > 1:
        return f"The same issue repeats across {host_count} hosts and should be handled as one investigation."
    if theme == "outdated" or theme == "general":
        return "An outdated or exposed service was identified. No exploit evidence was found."
    if len(tools) == 1:
        return f"Observed by {tools[0]}. Corroboration from another scanner was not present."
    return "Evidence indicates a condition that deserves analyst disposition."


def build_recommended_action(
    *,
    title: str = "",
    service: str = "",
    subject: str = "",
    cve: str = "",
    evidence: list[str] | None = None,
    theme: str = "",
    on_path: bool = False,
    exploit_evidence: bool = False,
) -> str:
    """Deterministic next action — never generic AI advice."""
    blob = f"{title} {service} {subject} {cve} {' '.join(str(e) for e in (evidence or []))}".lower()
    theme = theme or attention_theme(title, cve, evidence)
    subject_l = (subject or service or "").lower()

    if theme == "traversal" or "traversal" in blob:
        if "apache" in blob or "apache" in subject_l:
            return (
                "Upgrade Apache immediately and verify the directory traversal "
                "vulnerability has been remediated."
            )
        return "Upgrade the affected web server and verify directory traversal has been remediated."

    if theme == "anon_ftp" or re.search(r"anonymous.?ftp", blob):
        return "Disable anonymous FTP."

    if theme == "credential" or any(k in blob for k in ("password", "api key", "secret", "private key")):
        return "Rotate exposed credentials and revoke leaked tokens."

    if theme == "mfa" or "mfa" in blob or "multi-factor" in blob:
        return "Enable MFA on the affected accounts and verify enforcement."

    if theme == "cloud_exposure" or "s3" in blob or "public bucket" in blob:
        return "Remove public access from the exposed bucket or object."

    if theme == "iam" or "iam" in blob or "assume role" in blob:
        return "Review IAM permissions and remove excess privilege."

    if theme == "jenkins" or "jenkins" in blob:
        return "Patch Jenkins and restrict unauthenticated access."

    if "redis" in blob:
        return "Close exposed Redis and require authentication."

    if theme == "rce" or "remote code" in blob:
        return "Patch the affected service immediately and validate RCE is no longer possible."

    if theme == "sqli" or "sql injection" in blob:
        return "Remediate the injectable input path and retest."

    if "openssl" in blob:
        return "Upgrade OpenSSL and restart dependent services."

    if "openssh" in blob or (theme == "outdated" and "ssh" in blob):
        return "Verify whether the SSH version is still supported. Patch if required."

    if "ssh" in subject_l and (cve or theme in ("outdated", "cve", "general")):
        return "Verify whether the version is still supported. Patch if required."

    if "nginx" in blob:
        return "Upgrade Nginx and confirm the vulnerable configuration is gone."

    if "apache" in blob or "apache" in subject_l:
        return "Upgrade Apache and verify the vulnerability is remediated."

    if cve:
        return f"Patch or upgrade the affected service to remediate {cve}."

    if exploit_evidence or on_path:
        return "Validate manually, then remediate before asserting closure."

    if theme == "outdated":
        return "Verify whether the version is still supported. Patch if required."

    return "Validate manually."


def build_attention_card_fields(
    item: Any,
    *,
    peers: list[Any] | None = None,
    quality: dict[str, Any] | None = None,
    on_path: bool = False,
    host_count: int = 1,
    priority: float = 0,
    confidence: float = 0,
) -> dict[str, Any]:
    """Assemble the Attention Queue payload for one merged investigation."""
    quality = quality or {}
    members = [item, *(peers or [])]
    corr = item.correlated
    title = str(getattr(corr, "title", "") or "")
    cve = str(getattr(corr, "cve", "") or "")
    evidence_text = list(getattr(corr, "evidence", None) or [])
    for peer in peers or []:
        peer_corr = getattr(peer, "correlated", peer)
        evidence_text.extend(list(getattr(peer_corr, "evidence", None) or []))

    title_blob = " ".join(
        [
            title,
            *(
                str(getattr(getattr(peer, "correlated", peer), "title", "") or "")
                for peer in (peers or [])
            ),
        ]
    )
    cve_blob = cve or next(
        (
            str(getattr(getattr(peer, "correlated", peer), "cve", "") or "")
            for peer in (peers or [])
            if getattr(getattr(peer, "correlated", peer), "cve", None)
        ),
        "",
    )
    theme = attention_theme(title_blob, cve_blob, evidence_text)
    subject = attention_subject(item)
    files = collect_source_files(*members)
    evidence_rows = build_attention_evidence(*members)

    scanners: list[str] = []
    for row in evidence_rows:
        scanners.append(row["scanner"])
    for member in members:
        member_corr = getattr(member, "correlated", member)
        for src in getattr(member_corr, "sources", None) or []:
            scanners.append(str(src))

    validation = getattr(item, "validation", None)
    confirmed = bool(
        (validation is not None and getattr(validation, "cve_applicable", False))
        or (validation is not None and getattr(validation, "reproducible", False))
        or any(r["scanner"].lower() in ("nuclei", "burp", "metasploit") for r in evidence_rows)
    )
    exploit_evidence = int(quality.get("exploitability", 0) or 0) >= 60 or confirmed

    attention_required = build_attention_required(
        title=title_blob,
        cve=cve_blob,
        theme=theme,
        on_path=on_path,
        confirmed=confirmed,
    )
    why = build_why_this_matters(
        scanners=scanners,
        on_path=on_path,
        cve=cve_blob,
        host_count=host_count,
        exploit_evidence=exploit_evidence,
        theme=theme,
    )
    action = build_recommended_action(
        title=title_blob,
        service=str(getattr(corr, "service", "") or ""),
        subject=subject,
        cve=cve_blob,
        evidence=evidence_text,
        theme=theme,
        on_path=on_path,
        exploit_evidence=exploit_evidence,
    )
    reasons = build_analyst_reasons_from_engine_item(
        item, quality, on_path=on_path, host_count=host_count
    )

    return {
        "finding_id": str(getattr(corr, "id", "") or ""),
        "title": subject,
        "subject": subject,
        "host": str(getattr(corr, "host", "") or "") or "—",
        "host_count": host_count,
        "severity": str(getattr(corr, "severity", "") or "info").upper(),
        "priority": priority,
        "confidence": confidence,
        "attention_required": attention_required,
        "evidence": evidence_rows,
        "files": files,
        "source_file": files[0] if files else None,
        "source_files": files,
        "why_this_matters": why,
        "recommended_action": action,
        "reason": why,
        "reasons": reasons,
        "cve": cve_blob or None,
        "on_attack_path": on_path,
        "scanner_count": len({s.lower() for s in scanners if s}),
    }
