"""Evidence-first analysis layer.

Turns the engine's per-finding output (correlated raw findings + validation
booleans + analyst brief, all from `investigation.json`) into the analyst
sections VANE presents: Confirmed Findings, Correlated Evidence, Hypotheses,
Conflicts, Missing Evidence, Next Actions, and provenance ("Why we believe this").

Hard rule enforced here: every conclusion is derived from data the engine
already recorded. Nothing is invented. Strong compromise claims (shell,
command execution, privilege escalation, credential theft) are only ever
reported as *validated* when the engine explicitly recorded that evidence —
otherwise they appear under "Not validated" or "Missing Evidence".
"""

from __future__ import annotations

import re
from typing import Any

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

# Validation booleans -> human labels, in analyst reading order.
_CHECK_LABELS: list[tuple[str, str]] = [
    ("host_alive", "Host alive"),
    ("port_open", "Port open"),
    ("service_exists", "Service present"),
    ("service_fingerprinted", "Service fingerprint"),
    ("version_matches", "Version matched"),
    ("cve_applicable", "CVE matched"),
    ("reachable", "Reachable from entry point"),
    ("reproducible", "Response reproduced"),
    ("privilege_escalation_possible", "Privilege escalation"),
    ("lateral_movement_possible", "Lateral movement"),
]

# Weights used when reconstructing confidence from validation booleans.
_CHECK_WEIGHTS: dict[str, int] = {
    "host_alive": 8,
    "port_open": 10,
    "service_exists": 8,
    "service_fingerprinted": 12,
    "version_matches": 15,
    "cve_applicable": 12,
    "reachable": 10,
    "reproducible": 15,
    "privilege_escalation_possible": 8,
    "lateral_movement_possible": 8,
}

_SCANNER_AGREE_BONUS = 9  # per additional agreeing scanner beyond the first

# Strong compromise claims. Only ever "validated" with explicit exploit proof
# (exploitability_status == "confirmed"); otherwise always "not validated".
_COMPROMISE_CLAIMS = [
    "Interactive shell",
    "Arbitrary command execution",
    "Privilege escalation",
    "Credential theft",
]

_SEV_RANK = {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}

# Titles that are pure scanner noise / informational — never show exploit confidence.
_INFORMATIONAL_TITLE = re.compile(
    r"tcpwrapped|nping|http[-_\s]?title|ssl-date|ssh-hostkey|ftp-syst|"
    r"fingerprint-strings|system[-_\s]?info|traceroute|ike-version|"
    r"dns-nsid|smb-os-discovery|ssl-cert$",
    re.I,
)

# Which scanners can realistically detect a finding category.
_CAPABLE_SCANNERS: dict[str, tuple[str, ...]] = {
    "service": ("Nmap", "Nessus", "OpenVAS", "httpx", "Naabu"),
    "software": ("Nmap", "Nessus", "OpenVAS", "Nuclei"),
    "vulnerability": ("Nessus", "OpenVAS", "Nuclei", "Burp Suite", "Nmap"),
    "credential": ("Nmap", "Nessus", "OpenVAS", "Burp Suite"),
    "web": ("Burp Suite", "Nuclei", "Nmap", "httpx", "Nessus"),
    "informational": ("Nmap", "Nessus", "OpenVAS"),
    "network": ("Nmap", "Naabu", "Nessus"),
}

_VERSION_RE = re.compile(
    r"(?i)(?:^|[^\d.])(?:v(?:ersion)?[\s:]*)?"
    r"(\d+\.\d+(?:\.\d+){0,3}(?:[-_]?(?:p\d+|build\d+|[A-Za-z]*\d[\w.-]*))?)"
    r"(?=[^\d.]|$)"
)
# Reject IPs / dates mistaken for software versions
_NOT_VERSION_RE = re.compile(
    r"^(?:\d{1,3}\.){3}\d{1,3}$|^\d{4}\.\d{1,2}\.\d{1,2}"
)
_CPE_RE = re.compile(r"cpe:/[aoh]:[^\s]+", re.I)
_CVE_RE = re.compile(r"CVE-\d{4}-\d{4,}", re.I)
_ERROR_RE = re.compile(
    r"(?i)\b(error|unable to|failed|timeout|no response|not found|unknown|"
    r"tcpwrapped|filtered|closed)\b"
)
_WEAK_EVIDENCE_RE = re.compile(
    r"(?i)^(http-title|ssl-date|nping|tcpwrapped|traceroute|fingerprint)$|"
    r"echo reply|title:\s*$"
)
_STRONG_BANNER_RE = re.compile(
    r"(?i)(openssh|apache|nginx|iis|vsftpd|proftpd|postfix|bind|mysql|"
    r"postgresql|jenkins|tomcat|weblogic|exchange|smb|microsoft)"
)
_EXPLOIT_HINT_RE = re.compile(
    r"(?i)(anonymous|backdoor|rce|remote code|unauth|default.?pass|"
    r"vsftpd 2\.3\.4|heartbleed|shellshock|log4j|deserial|overflow|"
    r"traversal|injection|weak cipher|sslv2|export40)"
)
_AUTH_RE = re.compile(r"(?i)(auth|login|password|credential|401|403|negotiate|ntlm)")
_FP_RE = re.compile(
    r"(?i)(false positive|unable to obtain|no data|empty response|inconclusive)"
)


def tool_label(tool: str) -> str:
    key = (tool or "").strip().lower().replace(" ", "")
    return _TOOL_LABELS.get(key, (tool or "Evidence").replace("_", " ").title())


def _analyst_confidence(classification: str, machine: int) -> str:
    c = (classification or "").upper()
    if "CONFIRMED" in c:
        return "High"
    if "LIKELY" in c:
        return "Medium" if machine < 80 else "Medium-High"
    if "OBSERVED" in c:
        return "Medium" if machine >= 80 else "Low"
    return "Low"


def _status_label(classification: str, source_count: int) -> str:
    """Map engine classification to Observed / Correlated / Hypothesized / Validated."""
    c = (classification or "").upper()
    if "CONFIRMED" in c:
        return "Validated"
    if "LIKELY" in c:
        return "Hypothesized"
    if source_count >= 2:
        return "Correlated"
    return "Observed"


def _checklists(validation: dict) -> tuple[list[str], list[str]]:
    validated: list[str] = []
    not_validated: list[str] = []
    for key, label in _CHECK_LABELS:
        if validation.get(key):
            validated.append(label)
        else:
            not_validated.append(label)

    exploit_confirmed = str(validation.get("exploitability_status") or "") == "confirmed"
    for claim in _COMPROMISE_CLAIMS:
        if exploit_confirmed and claim in ("Arbitrary command execution", "Interactive shell"):
            validated.append(claim)
        elif claim == "Privilege escalation" and validation.get("privilege_escalation_possible"):
            # already added above via checklist; skip duplicate
            continue
        elif claim not in not_validated:
            not_validated.append(claim)

    # De-dupe while preserving order.
    return _dedupe(validated), _dedupe(not_validated)


def _dedupe(items: list[str]) -> list[str]:
    seen: list[str] = []
    for i in items:
        if i not in seen:
            seen.append(i)
    return seen


def _clamp(n: int, lo: int = 0, hi: int = 100) -> int:
    return max(lo, min(hi, int(n)))


def _factor(label: str, delta: int) -> dict[str, Any]:
    return {"label": label, "delta": int(delta)}


def _score_from_factors(factors: list[dict[str, Any]]) -> int:
    """Sum feature deltas with no floor — weak evidence stays weak."""
    return _clamp(sum(int(f["delta"]) for f in factors), 0, 100)


def _joined_evidence(raw: list[dict], evidence: list[str], title: str) -> str:
    parts = [str(title or "")]
    parts.extend(evidence or [])
    for rf in raw or []:
        for key in ("evidence", "description", "title", "service", "cpe", "cve"):
            val = rf.get(key)
            if val:
                parts.append(str(val))
    return "\n".join(parts)


def _extract_version(text: str, title: str) -> str | None:
    for candidate in (title, text):
        for m in _VERSION_RE.finditer(candidate or ""):
            ver = m.group(1)
            if _NOT_VERSION_RE.match(ver):
                continue
            # Prefer versions near product names
            return ver
    return None


def _extract_product(title: str, text: str) -> str:
    t = (title or "").strip()
    m = re.match(
        r"(?i)^(ftp|ssh|http|smtp|dns|ssl|smb|mysql|rdp|domain|netbios-ssn)[\s\-]+(.+)$",
        t,
    )
    if m and not _INFORMATIONAL_TITLE.search(t):
        return m.group(2).strip()[:80]
    strong = _STRONG_BANNER_RE.search(t) or _STRONG_BANNER_RE.search(text or "")
    if strong:
        start = strong.start()
        src = t if strong.re.search(t or "") else (text or "")
        snippet = src[start : start + 56]
        ver = _extract_version(snippet, "")
        product = strong.group(1)
        # Expand to full product token from title when possible
        word = re.search(
            rf"(?i)\b({re.escape(product)}[\w./-]*(?:\s+[\w./-]+)?)",
            t or text or "",
        )
        if word:
            product = word.group(1).strip()
        if ver and ver not in product:
            return f"{product} {ver}"[:80]
        return product[:80]
    return t[:80] if t else "Unknown entity"


def _finding_category(title: str, cve: str, severity: str, text: str) -> str:
    if cve or _CVE_RE.search(text or ""):
        return "vulnerability"
    if re.search(r"(?i)bindshell|root shell|backdoor", title or text or ""):
        return "credential"
    if _INFORMATIONAL_TITLE.search(title or ""):
        if re.search(r"(?i)nping|tcpwrapped|traceroute", title or ""):
            return "network"
        return "informational"
    if _AUTH_RE.search(title or "") or "anonymous" in (title or "").lower():
        return "credential"
    if _STRONG_BANNER_RE.search(title or "") or _VERSION_RE.search(title or ""):
        return "software"
    if re.search(r"(?i)http-title|burp|xss|csrf|servlet|jsp|php", title or text or ""):
        return "web"
    if (severity or "").lower() in ("critical", "high", "medium"):
        return "vulnerability"
    return "service"


def _banner_quality(text: str, title: str) -> tuple[int, str]:
    """Return (delta, label) from evidence richness — unique per finding."""
    body = (text or "").strip()
    if not body or _FP_RE.search(body):
        return -18, "Failed / empty banner"
    if _ERROR_RE.search(body) and len(body) < 80:
        return -12, "Error / inconclusive banner"
    if _WEAK_EVIDENCE_RE.search(title or "") or _WEAK_EVIDENCE_RE.search(body[:40]):
        return 4, "Weak metadata evidence"
    length = len(body)
    has_product = bool(_STRONG_BANNER_RE.search(body) or _STRONG_BANNER_RE.search(title or ""))
    has_version = bool(_extract_version(body, title or ""))
    has_cpe = bool(_CPE_RE.search(body))
    # Continuous score from content — not a boolean checklist.
    score = 0
    score += min(22, length // 12)  # longer unique banners score higher
    if has_product:
        score += 14
    if has_version:
        score += 16
    if has_cpe:
        score += 10
    if re.search(r"(?i)(cipher|key|certificate|plugin|template|qod)", body):
        score += 6
    if re.search(r"(?i)(code 230|anonymous login|authorized)", body):
        score += 10
    label = "Rich service banner" if score >= 30 else (
        "Partial banner" if score >= 16 else "Thin evidence text"
    )
    return min(48, score), label


def _version_certainty(text: str, title: str, validation: dict) -> tuple[int, str, int]:
    """Return (delta, label, version_confidence_pct)."""
    ver = _extract_version(text, title)
    if not ver:
        if validation.get("version_matches"):
            return 8, "Version flagged without parseable string", 55
        return -6, "No version identified", 20
    # Patch-level versions are more certain than major.minor alone
    parts = ver.split(".")
    certainty = 55 + min(35, len(parts) * 12)
    if re.search(r"(?i)(p\d+|build|ubuntu|debian|el\d)", ver):
        certainty = min(98, certainty + 12)
    if validation.get("version_matches"):
        certainty = min(99, certainty + 8)
    delta = max(4, (certainty - 40) // 2)
    return delta, f"Version {ver}", certainty


def _false_positive_penalty(text: str, title: str) -> tuple[int, str] | None:
    if _FP_RE.search(text or "") or _FP_RE.search(title or ""):
        return -22, "False-positive indicator"
    if re.search(r"(?i)\btcpwrapped\b", title or text or ""):
        return -16, "tcpwrapped / opaque service"
    if re.search(r"(?i)\bnping\b|\becho reply\b", title or text or ""):
        return -10, "Connectivity probe only"
    return None


def _build_feature_vector(
    *,
    title: str,
    host: str,
    severity: str,
    cve: str,
    sources: list[str],
    raw: list[dict],
    evidence: list[str],
    validation: dict,
    available_scanners: list[str],
) -> dict[str, Any]:
    """Emergent feature vector — every delta comes from this finding's evidence."""
    text = _joined_evidence(raw, evidence, title)
    category = _finding_category(title, cve, severity, text)
    product = _extract_product(title, text)
    version = _extract_version(text, title)
    cpe = (_CPE_RE.search(text) or [None])[0]
    cve_hit = cve or ((_CVE_RE.search(text).group(0) if _CVE_RE.search(text) else "") or "")

    features: list[dict[str, Any]] = []

    # Category weight — informational starts lower by nature of evidence class
    cat_delta = {
        "vulnerability": 18,
        "software": 14,
        "credential": 16,
        "service": 12,
        "web": 11,
        "network": 6,
        "informational": 5,
    }.get(category, 10)
    features.append(_factor(f"Category: {category}", cat_delta))

    banner_delta, banner_label = _banner_quality(text, title)
    features.append(_factor(banner_label, banner_delta))

    ver_delta, ver_label, version_confidence = _version_certainty(text, title, validation)
    features.append(_factor(ver_label, ver_delta))

    if cpe:
        features.append(_factor("CPE present", 12))
    else:
        features.append(_factor("No CPE", -3))

    # Scanner agreement against capable detectors (not 1/1 vanity)
    capable = _capable_scanners_for(category, available_scanners, sources)
    agreed = [s for s in sources if s in capable] or list(sources)
    agreed = _dedupe(agreed)
    capable = _dedupe(list(capable) or list(sources) or ["Evidence"])
    agreement_ratio = len(agreed) / max(len(capable), 1)
    if len(capable) == 1 and len(agreed) == 1:
        features.append(_factor("Single capable detector", 3))
    else:
        features.append(
            _factor(
                f"Scanner agreement {len(agreed)}/{len(capable)}",
                int(round(agreement_ratio * 28)) - (4 if agreement_ratio < 0.5 else 0),
            )
        )

    # Independent observations = unique proof lines / raw rows
    observations = max(len(raw), len([e for e in evidence if e]), 1)
    features.append(_factor(f"{observations} independent observation(s)", min(18, 4 + observations * 4)))

    # Conflicts across raw severities / hosts
    severities = {
        str(rf.get("severity") or "").lower()
        for rf in raw
        if str(rf.get("severity") or "").strip()
    }
    hosts = {str(rf.get("host") or "").lower() for rf in raw if rf.get("host")}
    conflicts = 0
    if len(severities) > 1:
        conflicts += 1
        features.append(_factor("Conflicting severity claims", -10))
    if len(hosts) > 1:
        conflicts += 1
        features.append(_factor("Conflicting host identity", -12))

    fp = _false_positive_penalty(text, title)
    if fp:
        features.append(_factor(fp[1], fp[0]))

    # Reachability / exposure from validation + evidence text
    if validation.get("reachable"):
        features.append(_factor("Network reachability", 10))
    elif validation.get("port_open") or validation.get("host_alive"):
        features.append(_factor("Host/port responsive", 6))
    if validation.get("reachable") and not validation.get("auth_required"):
        features.append(_factor("Internet-exposed path", 9))

    if validation.get("auth_required") or _AUTH_RE.search(text):
        features.append(_factor("Authentication required", -8))

    # CVE / exploit intelligence
    if cve_hit:
        features.append(_factor(f"CVE mapped ({cve_hit})", 14 if validation.get("cve_applicable") else 8))
    if validation.get("cve_applicable"):
        features.append(_factor("CVE applicability confirmed", 10))

    # EPSS / KEV placeholders when engine provides them on correlated/raw
    epss = None
    kev = False
    for rf in raw:
        if rf.get("epss") is not None:
            try:
                epss = float(rf.get("epss"))
            except (TypeError, ValueError):
                pass
        if rf.get("kev") or rf.get("known_exploited"):
            kev = True
    if epss is not None:
        features.append(_factor(f"EPSS {epss:.2f}", int(round(epss * 20))))
    if kev:
        features.append(_factor("KEV catalog presence", 16))

    if validation.get("reproducible") or str(validation.get("exploitability_status") or "") == "confirmed":
        features.append(_factor("Exploit reproduction", 18))
    if validation.get("privilege_escalation_possible"):
        features.append(_factor("Privilege escalation path", 11))
    if validation.get("lateral_movement_possible"):
        features.append(_factor("Downstream impact", 10))

    if _EXPLOIT_HINT_RE.search(title) or _EXPLOIT_HINT_RE.search(text):
        features.append(_factor("Exploit-relevant evidence pattern", 9))

    # Severity as weak prior only when evidence supports it
    sev = (severity or "").lower()
    if sev == "critical":
        features.append(_factor("Critical severity claim", 6))
    elif sev == "high":
        features.append(_factor("High severity claim", 4))
    elif sev == "info":
        features.append(_factor("Informational severity", -4))

    # Deduplicate labels keeping last (more specific) — then score
    by_label: dict[str, dict[str, Any]] = {}
    for f in features:
        by_label[f["label"]] = f
    feature_list = list(by_label.values())

    return {
        "category": category,
        "features": feature_list,
        "product": product,
        "version": version or "",
        "version_confidence": version_confidence,
        "cpe": cpe or "",
        "cve": cve_hit,
        "observations": observations,
        "conflicts": conflicts,
        "agreed_scanners": agreed,
        "capable_scanners": capable,
        "agreement_ratio": f"{len(agreed)} / {len(capable)}",
        "text_fingerprint": abs(hash(text[:400])) % 10_000,  # for uniqueness checks
    }


def _capable_scanners_for(
    category: str,
    available_scanners: list[str],
    sources: list[str],
) -> list[str]:
    """Scanners present in this investigation that could detect this entity."""
    preferred = _CAPABLE_SCANNERS.get(category, _CAPABLE_SCANNERS["service"])
    available = _dedupe(list(available_scanners) or list(sources))
    capable = [s for s in available if s in preferred]
    # Always include scanners that actually reported it
    for s in sources:
        if s not in capable:
            capable.append(s)
    if not capable:
        capable = list(sources) or list(available)[:1] or ["Evidence"]
    return capable


def _partition_features(
    features: list[dict[str, Any]],
    *,
    kind: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Split the same feature vector into observation / correlation / exploit views."""
    obs_keys = (
        "category", "banner", "version", "cpe", "observation", "false-positive",
        "tcpwrapped", "nping", "connectivity", "thin evidence", "rich service",
        "partial banner", "failed", "error", "metadata", "informational severity",
        "host/port", "no version", "no cpe",
    )
    corr_keys = (
        "scanner agreement", "single capable", "conflicting", "canonical",
    )
    exploit_keys = (
        "cve", "epss", "kev", "exploit", "privilege", "downstream", "internet",
        "authentication", "reachability", "critical severity", "high severity",
        "network reachability", "internet-exposed", "exploit-relevant",
    )

    def _match(label: str, keys: tuple[str, ...]) -> bool:
        low = label.lower()
        return any(k in low for k in keys)

    observation = [f for f in features if _match(f["label"], obs_keys)]
    correlation = [f for f in features if _match(f["label"], corr_keys)]
    exploit = [f for f in features if _match(f["label"], exploit_keys)]

    # Anything unmatched goes to observation (existence)
    assigned = {id(f) for f in observation + correlation + exploit}
    for f in features:
        if id(f) not in assigned:
            observation.append(f)

    if kind in ("informational", "service_observation"):
        exploit = []
    if len(correlation) == 0:
        # Keep agreement feature visible under observation when only one capable scanner
        pass

    return observation, correlation, exploit


def _is_informational(title: str, severity: str, cve: str, validation: dict, category: str) -> bool:
    """Pure scanner noise — no exploit framing is analytically meaningful."""
    if cve or validation.get("cve_applicable"):
        return False
    if validation.get("reproducible"):
        return False
    if category in ("software", "vulnerability", "credential", "service"):
        return False
    title_s = str(title) or ""
    if _INFORMATIONAL_TITLE.search(title_s) or category in ("informational", "network"):
        return True
    return False


def _finding_kind(
    *,
    title: str,
    severity: str,
    classification: str,
    sources: list[str],
    cve: str,
    validation: dict,
    status: str,
    category: str,
) -> str:
    if _is_informational(title, severity, cve, validation, category):
        return "informational"
    cu = (classification or "").upper()
    exploit = str(validation.get("exploitability_status") or "").lower()
    if (
        status == "Validated"
        or "CONFIRMED" in cu
        or exploit == "confirmed"
        or validation.get("reproducible")
    ):
        return "validated_exposure"
    if (
        len(sources) >= 2
        or cve
        or validation.get("cve_applicable")
        or "LIKELY" in cu
        or category == "vulnerability"
    ):
        return "correlated_vulnerability"
    if status in ("Correlated", "Hypothesized"):
        return "correlated_vulnerability"
    return "service_observation"


def _metric(score: int, factors: list[dict[str, Any]], question: str) -> dict[str, Any]:
    return {
        "score": score,
        "factors": factors[:12],
        "question": question,
    }


# --------------------------------------------------------------------------- #
# Engine-first semantic confidence
#
# When the VAYNE engine has already produced its evidence-driven, multi-
# dimensional confidence (observation / exploit / impact / overall + explainable
# factor contributions), the product layer surfaces THAT as the source of truth
# instead of re-deriving anything. The output shape is identical to the legacy
# `_build_semantic_confidence` so the UI is untouched.
# --------------------------------------------------------------------------- #
def _factors_to_ui(factors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {"label": str(f.get("label") or ""), "delta": int(f.get("delta") or 0)}
        for f in factors or []
    ]


def _ui_kind_from_engine(canonical_kind: str, validation: dict, classification: str) -> str:
    ck = (canonical_kind or "").lower()
    if ck in ("informational", "network"):
        return "informational"
    cu = (classification or "").upper()
    exploit = str(validation.get("exploitability_status") or "").lower()
    if "CONFIRMED" in cu or exploit == "confirmed" or validation.get("reproducible"):
        return "validated_exposure"
    if (
        ck == "vulnerability"
        or validation.get("cve_applicable")
        or "LIKELY" in cu
        or "UNCONFIRMED" in cu
    ):
        return "correlated_vulnerability"
    return "service_observation"


def _semantic_from_engine(
    validation: dict,
    corr: dict,
    sources: list[str],
) -> dict[str, Any]:
    factors = validation.get("confidence_factors") or {}
    obs_f = _factors_to_ui(factors.get("observation") or [])
    rel_f = _factors_to_ui(factors.get("reliability") or [])
    exp_f = _factors_to_ui(factors.get("exploit") or [])
    imp_f = _factors_to_ui(factors.get("impact") or [])

    canonical = corr.get("canonical_entity") or {}
    agreement_raw = corr.get("scanner_agreement") or {}
    version_agreement = corr.get("version_agreement") or {}
    conflicts = corr.get("conflicts") or []

    kind = _ui_kind_from_engine(
        str(canonical.get("kind") or ""), validation, str(validation.get("classification") or "")
    )

    agreed = _dedupe([tool_label(str(t)) for t in (agreement_raw.get("agreed") or [])]) or sources
    capable = _dedupe([tool_label(str(t)) for t in (agreement_raw.get("capable") or [])]) or agreed
    ratio = float(agreement_raw.get("ratio") or (len(agreed) / max(len(capable), 1)))
    agreement_label = str(agreement_raw.get("label") or f"{len(agreed)} / {len(capable)}")

    observation_score = int(validation.get("observation_confidence") or 0)
    exploit_score = int(validation.get("exploit_confidence") or 0)
    overall_score = int(
        validation.get("overall_confidence") or observation_score
    )

    observation = _metric(
        observation_score, obs_f, "Does this asset, service, or vulnerability exist?"
    )

    reliability_score = int(validation.get("reliability_confidence") or 0)
    reliability = None
    if rel_f:
        reliability = _metric(
            reliability_score, rel_f, "How trustworthy is the evidence behind this finding?"
        )

    exploit = None
    if kind != "informational" and exp_f and exploit_score > 0:
        exploit = _metric(exploit_score, exp_f, "How likely is successful exploitation?")

    correlation = None
    if len(capable) > 1:
        corr_factors = [
            {"label": f"Scanner agreement {agreement_label}", "delta": int(round(ratio * 40))}
        ]
        if len(agreed) < len(capable):
            corr_factors.append(
                {"label": f"{len(capable) - len(agreed)} capable scanner(s) silent", "delta": 0}
            )
        correlation = _metric(
            _clamp(int(round(ratio * 100))),
            corr_factors,
            "Do independent scanners agree on this finding?",
        )

    display: list[str] = ["observation"]
    if correlation is not None:
        display.append("correlation")
    if exploit is not None and kind in ("correlated_vulnerability", "validated_exposure"):
        display.append("exploit")

    if "exploit" in display and exploit is not None:
        primary_metric = "exploit"
    elif "correlation" in display and len(agreed) > 1:
        primary_metric = "correlation"
    else:
        primary_metric = "observation"

    all_features = obs_f + rel_f + exp_f + imp_f

    evidence_summary = {
        "scanners": len(agreed),
        "capable_scanners": len(capable),
        "independent_observations": len(corr.get("evidence_ids") or corr.get("findings") or []) or 1,
        "conflicts": len(conflicts),
        "canonical_entity": str(canonical.get("label") or canonical.get("product") or ""),
        "version_confidence": 90 if version_agreement.get("agreed") and canonical.get("version") else (
            40 if not canonical.get("version") else 70
        ),
        "version": str(canonical.get("version") or ""),
        "cpe": str(canonical.get("cpe") or ""),
        "category": str(canonical.get("kind") or ""),
    }

    return {
        "kind": kind,
        "observation": observation,
        "reliability": reliability,
        "correlation": correlation,
        "exploit": exploit,
        "impact": {
            "score": int(validation.get("impact_confidence") or 0),
            "factors": imp_f[:12],
            "question": "Does this affect business operations?",
        },
        "overall": overall_score,
        "display": display,
        # Headline number is the engine's evidence-weighted overall confidence.
        "primary": {"metric": primary_metric, "score": overall_score},
        "features": all_features,
        "evidence_summary": evidence_summary,
        "scanner_agreement": {
            "agreed": agreed,
            "capable": capable,
            "total": len(capable),
            "ratio": agreement_label,
        },
        "supporting_evidence": [str(s) for s in (validation.get("supporting_evidence") or [])],
        "contradicting_evidence": [str(s) for s in (validation.get("contradicting_evidence") or [])],
        "engine": True,
    }


def _build_semantic_confidence(
    *,
    validation: dict,
    sources: list[str],
    raw: list[dict],
    evidence: list[str],
    title: str,
    host: str,
    severity: str,
    classification: str,
    cve: str,
    status: str,
    available_scanners: list[str],
) -> dict[str, Any]:
    vector = _build_feature_vector(
        title=title,
        host=host,
        severity=severity,
        cve=cve,
        sources=sources,
        raw=raw,
        evidence=evidence,
        validation=validation,
        available_scanners=available_scanners,
    )
    kind = _finding_kind(
        title=title,
        severity=severity,
        classification=classification,
        sources=sources,
        cve=cve,
        validation=validation,
        status=status,
        category=vector["category"],
    )
    obs_f, corr_f, expl_f = _partition_features(vector["features"], kind=kind)

    observation = _metric(
        _score_from_factors(obs_f),
        obs_f,
        "Does this asset, service, or vulnerability exist?",
    )
    # Correlation only when multiple capable scanners exist OR multiple agreed
    correlation = None
    if len(vector["capable_scanners"]) > 1 or len(vector["agreed_scanners"]) > 1:
        if not corr_f:
            corr_f = [
                _factor(
                    f"Scanner agreement {vector['agreement_ratio']}",
                    int(round(
                        (len(vector["agreed_scanners"]) / max(len(vector["capable_scanners"]), 1))
                        * 40
                    )),
                )
            ]
        correlation = _metric(
            _score_from_factors(corr_f),
            corr_f,
            "Do independent scanners agree on this finding?",
        )

    exploit = None
    if kind not in ("informational",) and (
        kind == "validated_exposure"
        or kind == "correlated_vulnerability"
        or any("exploit" in f["label"].lower() or "cve" in f["label"].lower() for f in expl_f)
    ):
        if expl_f:
            exploit = _metric(
                _score_from_factors(expl_f),
                expl_f,
                "How likely is successful exploitation?",
            )

    display: list[str] = ["observation"]
    if correlation is not None and kind != "informational":
        # Show correlation whenever capable set > 1 (even if only one agreed)
        if len(vector["capable_scanners"]) > 1:
            display.append("correlation")
    if exploit is not None and kind in ("correlated_vulnerability", "validated_exposure"):
        display.append("exploit")
    if kind == "service_observation":
        display = ["observation"]
        if correlation is not None and len(vector["capable_scanners"]) > 1:
            display.append("correlation")

    if "exploit" in display and exploit is not None:
        primary_key, primary_score = "exploit", exploit["score"]
    elif "correlation" in display and correlation is not None and len(vector["agreed_scanners"]) > 1:
        primary_key, primary_score = "correlation", correlation["score"]
    else:
        primary_key, primary_score = "observation", observation["score"]

    evidence_summary = {
        "scanners": len(vector["agreed_scanners"]),
        "capable_scanners": len(vector["capable_scanners"]),
        "independent_observations": vector["observations"],
        "conflicts": vector["conflicts"],
        "canonical_entity": vector["product"],
        "version_confidence": vector["version_confidence"],
        "version": vector["version"],
        "cpe": vector["cpe"],
        "category": vector["category"],
    }

    return {
        "kind": kind,
        "observation": observation,
        "correlation": correlation,
        "exploit": exploit,
        "display": display,
        "primary": {"metric": primary_key, "score": primary_score},
        "features": vector["features"],
        "evidence_summary": evidence_summary,
        "scanner_agreement": {
            "agreed": vector["agreed_scanners"],
            "capable": vector["capable_scanners"],
            "total": len(vector["capable_scanners"]),
            "ratio": vector["agreement_ratio"],
        },
    }


def _proof_detail(tool: str, rf: dict) -> str:
    """Compact per-scanner proof line — never 'Observed by X'."""
    label = tool.lower().replace(" ", "")
    evidence = str(rf.get("evidence") or rf.get("description") or "").strip()
    plugin = rf.get("plugin_id") or rf.get("pluginId") or rf.get("qid") or rf.get("template_id")
    title = str(rf.get("title") or "").strip()

    if "nessus" in label and plugin:
        return f"Plugin ID {plugin}"
    if "openvas" in label:
        qod = rf.get("qod") or rf.get("quality_of_detection")
        if qod:
            return f"QOD {qod}"
        if plugin:
            return f"QOD / NVF {plugin}"
    if "nuclei" in label:
        tmpl = rf.get("template_id") or rf.get("template") or plugin or title
        return f"Matched template {tmpl}" if tmpl else (evidence[:120] or "Template match")
    if "burp" in label:
        # Prefer HTTP status if present in evidence
        m = re.search(r"HTTP[/ ]?\d*\s*(\d{3})", evidence, re.I)
        if m:
            return f"HTTP {m.group(1)}"
        if re.search(r"\b(200|301|302|401|403|500)\b", evidence):
            return f"HTTP {re.search(r'(200|301|302|401|403|500)', evidence).group(1)}"
        return evidence[:120] or title or "HTTP evidence"
    # Nmap / default — service/version fingerprint
    if evidence:
        return evidence[:140]
    if title:
        return title[:140]
    return "Scanner observation"


def _build_proof(raw: list[dict]) -> list[dict[str, str]]:
    proof: list[dict[str, str]] = []
    seen: set[str] = set()
    for rf in raw or []:
        source = tool_label(str(rf.get("source_tool") or ""))
        detail = _proof_detail(source, rf)
        key = f"{source}|{detail}"
        if key in seen:
            continue
        seen.add(key)
        proof.append({"source": source, "detail": detail})
    return proof[:8]


def _business_from_engine(bi: dict) -> dict[str, Any]:
    """Map the engine's dynamic business-impact object to the product/UI shape."""
    return {
        "attacker_gains": str(bi.get("attacker_gains") or "")[:220],
        "systems_exposed": str(bi.get("systems_exposed") or "")[:180],
        "process_affected": str(bi.get("business_process_affected") or "")[:180],
        "importance": str(bi.get("potential_consequences") or bi.get("summary") or "")[:280],
        "summary": str(bi.get("summary") or "")[:280],
        "score": int(bi.get("score") or 0),
        "factors": [
            {"label": str(f.get("label") or ""), "delta": int(f.get("delta") or 0)}
            for f in (bi.get("factors") or [])
        ][:12],
    }


def _claim_status_from_validation(validation: dict, *, exploit_confirmed: bool) -> str:
    classification = str(validation.get("classification") or "").upper()
    if exploit_confirmed:
        return "confirmed"
    if "CONFIRMED" in classification:
        return "confirmed"
    if "LIKELY" in classification or "UNCONFIRMED" in classification:
        return "suspected"
    if "OBSERVED" in classification:
        return "observed"
    if "FALSE POSITIVE" in classification:
        return "rejected"
    return "needs_validation"


def _build_business_impact(analyst: dict, *, title: str, host: str, cve: str) -> dict[str, str]:
    impact = str(analyst.get("impact_assessment") or "").strip()
    why = str(analyst.get("why_this_matters") or "").strip()
    scenario = str(analyst.get("attack_scenario") or "").strip()
    if scenario.upper().startswith("UNKNOWN"):
        scenario = ""
    actions = [str(a).strip() for a in (analyst.get("likely_attacker_actions") or []) if str(a).strip()]
    prereqs = [str(p).strip() for p in (analyst.get("prerequisites") or []) if str(p).strip()]
    actions = [
        a
        for a in actions
        if "insufficient" not in a.lower() and "validate finding manually" not in a.lower()
    ]

    has_engine_fields = any([impact, why, scenario, actions])
    if not has_engine_fields:
        return {
            "attacker_gains": "Unknown — exploitation not validated.",
            "systems_exposed": f"{host or 'Affected host'} — exposure scope needs validation.",
            "process_affected": "Unknown until business context and exploit path are confirmed.",
            "importance": "Needs validation before operational impact can be assessed.",
            "summary": "Needs validation — insufficient evidence to quantify business impact.",
            "claim_status": "unknown",
        }

    attacker_gains = actions[0] if actions else (
        scenario.split(".")[0].strip() if scenario else "Unknown — no validated attacker outcome."
    )
    systems_exposed = (
        f"{host or 'This host'} is exposed on the internet — reachability evidence supports external access."
        if "internet" in (impact + why + scenario).lower() or validation_reachable_hint(impact, why)
        else f"Internal systems on {host or 'the affected host'} — external exposure not confirmed."
    )

    process_affected = (
        "Customer-facing websites, portals, and services (if internet-facing exposure is confirmed)"
        if "internet" in (impact + why).lower() or validation_reachable_hint(impact, why)
        else "Internal apps and operations on the affected server — scope needs validation."
    )
    importance = why or impact or "Needs validation before operational impact can be assessed."
    if "Exploitability not assessed" in importance:
        importance = (
            f"If exploited (unvalidated): {scenario.split('.')[0].strip()}."
            if scenario
            else "Needs validation — exploit path not confirmed."
        )
    elif scenario and not why and not impact:
        importance = f"Analyst scenario (unvalidated): {scenario.split('.')[0].strip()}."

    summary = importance
    if "needs validation" not in summary.lower() and "unknown" not in summary.lower():
        summary = summary[:280]
    else:
        summary = "Needs validation — insufficient evidence to quantify business impact."

    return {
        "attacker_gains": attacker_gains[:220],
        "systems_exposed": systems_exposed[:180],
        "process_affected": process_affected[:180],
        "importance": importance[:280],
        "summary": summary[:280],
        "claim_status": "suspected" if scenario or actions else "unknown",
    }


def validation_reachable_hint(*texts: str) -> bool:
    blob = " ".join(texts).lower()
    return "remote" in blob or "internet" in blob or "external" in blob


def analyze_findings(
    investigated: list[dict],
    *,
    available_scanners: list[str] | None = None,
) -> dict[str, Any]:
    """Build every evidence-first section from the engine's investigated findings."""
    confirmed: list[dict] = []
    hypotheses: list[dict] = []
    conflicts: list[dict] = []
    provenance: list[dict] = []

    any_priv_esc = False
    any_lateral = False
    any_reproduced = False
    any_cve_applicable = False
    any_version = False
    has_cve = False
    has_credentials = False

    # Scanners present in this investigation — used for capable-detector agreement.
    scanners_in_run: list[str] = list(available_scanners or [])
    if not scanners_in_run:
        for item in investigated:
            corr = item.get("correlated") or {}
            for s in corr.get("sources") or []:
                scanners_in_run.append(tool_label(str(s)))
            for rf in corr.get("findings") or []:
                if rf.get("source_tool"):
                    scanners_in_run.append(tool_label(str(rf.get("source_tool"))))
        scanners_in_run = _dedupe(scanners_in_run)

    for item in investigated:
        corr = item.get("correlated") or {}
        validation = item.get("validation") or {}
        analyst = item.get("analyst") or {}
        intelligence = item.get("intelligence") or {}
        classification = str(validation.get("classification") or "")
        if classification.upper() == "FALSE POSITIVE":
            continue

        title = corr.get("title") or corr.get("cve") or "Finding"
        host = corr.get("host") or ""
        severity = str(corr.get("severity") or "info")
        sources = [tool_label(str(s)) for s in (corr.get("sources") or [])]
        raw = corr.get("findings") or []
        evidence = [str(e) for e in (corr.get("evidence") or []) if str(e).strip()]
        reasoning = [str(r) for r in (validation.get("reasoning") or []) if str(r).strip()]

        any_priv_esc = any_priv_esc or bool(validation.get("privilege_escalation_possible"))
        any_lateral = any_lateral or bool(validation.get("lateral_movement_possible"))
        any_reproduced = any_reproduced or bool(validation.get("reproducible"))
        any_cve_applicable = any_cve_applicable or bool(validation.get("cve_applicable"))
        any_version = any_version or bool(validation.get("version_matches"))
        if corr.get("cve"):
            has_cve = True
        if "credential" in title.lower() or "password" in title.lower():
            has_credentials = True

        validated_checks, not_validated_checks = _checklists(validation)
        proof = _build_proof(raw)
        status = _status_label(classification, len(sources))
        # Engine-first: use the engine's evidence-driven confidence when present;
        # otherwise fall back to the product-side reconstruction (older exports).
        if validation.get("confidence_factors") or validation.get("overall_confidence"):
            semantic = _semantic_from_engine(validation, corr, sources)
        else:
            semantic = _build_semantic_confidence(
                validation=validation,
                sources=sources,
                raw=raw,
                evidence=evidence,
                title=str(title),
                host=str(host),
                severity=severity,
                classification=classification,
                cve=str(corr.get("cve") or ""),
                status=status,
                available_scanners=scanners_in_run,
            )
        primary_score = int(semantic["primary"]["score"])
        obs_factors = (semantic.get("observation") or {}).get("factors") or []
        agreement = semantic.get("scanner_agreement") or {
            "agreed": sources,
            "capable": sources,
            "total": max(len(sources), 1),
            "ratio": f"{len(sources)} / {max(len(sources), 1)}",
        }
        # Business impact: prefer the engine's dynamic, multi-factor computation.
        if intelligence.get("business_impact"):
            business = _business_from_engine(intelligence["business_impact"])
        else:
            business = _build_business_impact(
                analyst, title=str(title), host=str(host), cve=str(corr.get("cve") or "")
            )

        # Reasoning: prefer the engine's analyst-notebook reasoning when present.
        engine_reasoning = [
            str(r) for r in (intelligence.get("reasoning") or []) if str(r).strip()
        ]
        if engine_reasoning:
            reasoning = engine_reasoning

        # Unique one-line reason derived from this finding's top positive/negative features.
        feat = semantic.get("features") or obs_factors
        top_pos = sorted(feat, key=lambda f: f["delta"], reverse=True)[:2]
        top_neg = sorted([f for f in feat if f["delta"] < 0], key=lambda f: f["delta"])[:1]
        reason_bits = [f"{f['label']} ({f['delta']:+d})" for f in top_pos + top_neg]
        unique_reason = "; ".join(reason_bits) if reason_bits else ""

        exploit_confirmed = str(validation.get("exploitability_status") or "") == "confirmed"
        claim_status = _claim_status_from_validation(validation, exploit_confirmed=exploit_confirmed)
        sr = intelligence.get("self_review") or {}
        review_incomplete = sr.get("complete") is False
        if review_incomplete and claim_status == "confirmed":
            claim_status = "suspected"

        investigation_payload = intelligence.get("investigation") or {}
        structured_nb = investigation_payload.get("structured_notebook") or {}
        if not structured_nb and investigation_payload and not investigation_payload.get("deferred"):
            structured_nb = {
                "observation": investigation_payload.get("conclusion") or "",
                "evidence": [
                    str(p.get("display") or "") for p in (investigation_payload.get("evidence_primitives") or [])[:6]
                ],
                "reasoning": investigation_payload.get("human_reasoning") or reasoning[:4],
                "alternative_explanations": [
                    str(h.get("label") or h.get("title") or "")
                    for h in (investigation_payload.get("hypotheses") or [])
                    if h.get("category") != "primary"
                ][:4],
                "confidence": {
                    "score": primary_score,
                    "band": _analyst_confidence(classification, primary_score),
                    "status": claim_status,
                },
                "missing_evidence": [
                    str(t.get("label") or t.get("action") or "")
                    for t in (investigation_payload.get("investigation_tasks") or [])[:4]
                ],
                "recommended_next_step": (
                    str((investigation_payload.get("investigation_tasks") or [{}])[0].get("label") or "")
                    or "Validate finding manually before asserting compromise."
                ),
            }
            investigation_payload = {**investigation_payload, "structured_notebook": structured_nb}

        confirmed.append(
            {
                "id": corr.get("id") or title,
                "title": title,
                "host": host,
                "severity": severity,
                "severity_rank": _SEV_RANK.get(severity.lower(), 0),
                "classification": classification,
                "status": status,
                "claim_status": claim_status,
                "review_incomplete": review_incomplete,
                "machine_confidence": primary_score,
                "analyst_confidence": _analyst_confidence(classification, primary_score),
                "sources": sources,
                "reasoning": ([unique_reason] + reasoning)[:6] if unique_reason else reasoning[:6],
                "evidence": evidence[:4],
                "proof": proof,
                "confidence": semantic,
                "evidence_summary": semantic.get("evidence_summary"),
                "confidence_factors": obs_factors,
                "base_confidence": int(
                    (semantic.get("observation") or {}).get("score") or primary_score
                ),
                "final_confidence": primary_score,
                "scanner_agreement": {
                    "agreed": agreement.get("agreed") or sources,
                    "capable": agreement.get("capable") or sources,
                    "total": int(agreement.get("total") or max(len(sources), 1)),
                    "ratio": agreement.get("ratio")
                    or f"{len(sources)} / {max(len(sources), 1)}",
                },
                "why_it_matters": str(
                    analyst.get("why_this_matters") or analyst.get("impact_assessment") or ""
                ),
                "business_impact": business["summary"],
                "business_impact_detail": business,
                "cve": corr.get("cve") or "",
                "validated_checks": validated_checks,
                "not_validated_checks": not_validated_checks,
                "unique_reason": unique_reason,
                # Phase 2 engine intelligence (additive; engine is source of truth).
                "recommendations": intelligence.get("recommendations") or [],
                "conflicts_detail": intelligence.get("conflicts") or [],
                "confidence_timeline": intelligence.get("timeline") or [],
                "service_profile": intelligence.get("service_profile") or {},
                "self_review": intelligence.get("self_review") or {},
                # Phase 3 autonomous investigation (stages, hypotheses, evidence
                # primitives, self-challenge, attack story, tasks, notebook).
                "investigation": investigation_payload,
            }
        )

        # Provenance — one entry per tool that contributed raw evidence.
        supports: list[dict] = []
        for rf in raw:
            ev = str(rf.get("evidence") or rf.get("description") or "").strip()
            if not ev:
                continue
            supports.append(
                {
                    "source": tool_label(str(rf.get("source_tool") or "")),
                    "evidence": ev[:220],
                }
            )
        if supports:
            provenance.append(
                {
                    "claim": f"{title} on {host} — {_status_label(classification, len(sources)).lower()}",
                    "supports": supports[:6],
                }
            )

        # Hypotheses — exploitation is plausible but not proven.
        exploit_confirmed = str(validation.get("exploitability_status") or "") == "confirmed"
        cu = classification.upper()
        if not exploit_confirmed and (
            "LIKELY" in cu or "UNCONFIRMED" in cu or corr.get("cve")
        ):
            scenario = str(analyst.get("attack_scenario") or "").strip()
            if scenario.upper().startswith("UNKNOWN"):
                scenario = ""
            hypotheses.append(
                {
                    "title": f"Possible exploitation of {title}",
                    "status": "Hypothesis",
                    "reason": scenario
                    or f"{title} is present and fingerprinted — needs validation before asserting exploitation.",
                    "current_evidence": "Observation confirmed by scanners; exploit execution not validated.",
                    "required_validation": "Attempt controlled, safe exploit validation in a test window.",
                    "confidence": primary_score,
                }
            )

        # Conflicts — same finding, different severity taxonomy across sources.
        severities = _dedupe([str(rf.get("severity") or "").lower() for rf in raw if rf.get("severity")])
        if len(sources) >= 2 and len(severities) >= 2:
            conflicts.append(
                {
                    "subject": title,
                    "host": host,
                    "statements": [
                        {
                            "source": tool_label(str(rf.get("source_tool") or "")),
                            "claim": str(rf.get("severity") or "").title() or "reported",
                        }
                        for rf in raw
                        if rf.get("severity")
                    ][:4],
                    "explanation": (
                        "The scanners describe the same underlying finding using different "
                        "severity taxonomies. No conflict exists in the raw evidence."
                    ),
                }
            )

    confirmed.sort(
        key=lambda f: (
            0 if f.get("confidence", {}).get("kind") == "informational" else 1,
            2 if "exploit" in (f.get("confidence", {}).get("display") or []) else (
                1 if "correlation" in (f.get("confidence", {}).get("display") or []) else 0
            ),
            f["severity_rank"],
            len(f["sources"]),
            f["machine_confidence"],
        ),
        reverse=True,
    )

    top_conf = int(confirmed[0]["machine_confidence"]) if confirmed else 50
    unknowns = _build_missing_evidence(
        any_priv_esc=any_priv_esc,
        any_lateral=any_lateral,
        any_reproduced=any_reproduced,
        any_cve_applicable=any_cve_applicable,
        any_version=any_version,
        has_cve=has_cve,
        has_credentials=has_credentials,
        has_findings=bool(confirmed),
        top_confidence=top_conf,
    )

    return {
        "confirmed_findings": confirmed,
        "hypotheses": hypotheses[:6],
        "conflicts": conflicts[:6],
        "provenance": provenance,
        "unknowns": unknowns,
        "missing_evidence": unknowns,
    }


def _dedupe_dicts(items: list[dict], *, key: str) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for row in items:
        k = str(row.get(key, ""))
        if k in seen:
            continue
        seen.add(k)
        out.append(row)
    return out


def _unknown(topic: str, reason: str, evidence_needed: str, expected_gain: int = 0) -> dict[str, Any]:
    return {
        "topic": topic,
        "reason": reason,
        "evidence_needed": evidence_needed,
        "expected_gain": expected_gain,
    }


def _unknown_text(item: dict[str, Any] | str) -> str:
    if isinstance(item, str):
        return item
    return str(item.get("topic") or "")


def _gain(remaining: int, share: float, *, floor: int = 3, ceiling: int | None = None) -> int:
    cap = ceiling if ceiling is not None else remaining
    return max(floor, min(cap, int(round(remaining * share))))


def _build_missing_evidence(
    *,
    any_priv_esc: bool,
    any_lateral: bool,
    any_reproduced: bool,
    any_cve_applicable: bool,
    any_version: bool,
    has_cve: bool,
    has_credentials: bool,
    has_findings: bool,
    top_confidence: int,
) -> list[dict[str, Any]]:
    """Missing Evidence tasks with expected confidence gain (replaces Unknowns)."""
    remaining = max(0, 100 - top_confidence)
    if not has_findings:
        return [
            _unknown(
                "Retained findings",
                "None met threshold",
                "Additional scanner coverage or manual validation",
                0,
            )
        ]

    tasks: list[dict[str, Any]] = []
    if not any_reproduced:
        tasks.append(
            _unknown(
                "Replay exploit",
                "Exploit execution not observed",
                "Controlled exploit reproduction",
                _gain(remaining, 0.35, floor=4, ceiling=15),
            )
        )
    if not has_credentials:
        tasks.append(
            _unknown(
                "Credential validation",
                "No credential evidence",
                "Auth log review or credential dump",
                _gain(remaining, 0.40, floor=5, ceiling=18),
            )
        )
    if not any_version:
        tasks.append(
            _unknown(
                "Manual version check",
                "Version not independently confirmed",
                "Banner / package version check",
                _gain(remaining, 0.15, floor=3, ceiling=8),
            )
        )
    if not any_priv_esc:
        tasks.append(
            _unknown(
                "Privilege escalation",
                "No privilege escalation evidence",
                "Local exploit or admin credential proof",
                _gain(remaining, 0.45, floor=6, ceiling=20),
            )
        )
    if not any_lateral:
        tasks.append(
            _unknown(
                "Lateral movement",
                "No lateral movement evidence",
                "Additional host compromise evidence",
                _gain(remaining, 0.40, floor=5, ceiling=18),
            )
        )
    if has_cve and not any_cve_applicable:
        tasks.append(
            _unknown(
                "CVE applicability",
                "CVE match not confirmed",
                "Targeted exploit check in lab",
                _gain(remaining, 0.30, floor=4, ceiling=12),
            )
        )
    # Always surface interactive shell as a high-value missing proof when findings exist
    # and exploit was not reproduced.
    if not any_reproduced:
        # Interactive shell is covered by Replay exploit; skip duplicate topic.
        pass

    return _dedupe_dicts(tasks, key="topic")[:8]


# Back-compat alias used by older call sites / tests.
def _build_unknowns(**kwargs: Any) -> list[dict[str, Any]]:
    return _build_missing_evidence(
        any_priv_esc=kwargs.get("any_priv_esc", False),
        any_lateral=kwargs.get("any_lateral", False),
        any_reproduced=kwargs.get("any_reproduced", False),
        any_cve_applicable=kwargs.get("any_cve_applicable", False),
        any_version=kwargs.get("any_version", False),
        has_cve=kwargs.get("has_cve", False),
        has_credentials=kwargs.get("has_credentials", False),
        has_findings=kwargs.get("has_findings", False),
        top_confidence=kwargs.get("top_confidence", 50),
    )


def build_next_actions(
    hypotheses: list[dict],
    remediation: dict | None,
    unknowns: list[dict[str, Any] | str],
) -> list[str]:
    """Rank concrete analyst actions from validations, missing evidence, and fixes."""
    actions: list[str] = []

    # Prefer missing-evidence tasks sorted by expected gain.
    ranked = sorted(
        [u for u in unknowns if isinstance(u, dict)],
        key=lambda u: int(u.get("expected_gain") or 0),
        reverse=True,
    )
    for u in ranked[:3]:
        topic = str(u.get("topic") or "").strip()
        if topic:
            actions.append(topic)

    # Validate the most important hypotheses.
    for h in hypotheses[:2]:
        actions.append(h.get("required_validation") or f"Validate: {h.get('title')}")

    # Apply concrete remediation fixes from the engine's plan.
    for item in (remediation or {}).get("items", [])[:3]:
        fix = str(item.get("fix") or "").strip()
        if fix:
            actions.append(fix)

    actions.append("Search logs for evidence of exploitation of the affected services.")
    return _dedupe(actions)[:8]


def build_executive_summary(
    *,
    file_count: int,
    source_count: int,
    asset_count: int,
    confirmed: list[dict],
    cross_source_matches: int,
    classification: str,
    hypotheses: list[dict],
) -> str:
    """Interpretive first-person assessment — what happened, why, certainty, next."""
    if not confirmed:
        return (
            f"I reviewed {file_count} evidence source"
            f"{'' if file_count == 1 else 's'} across {asset_count} asset"
            f"{'' if asset_count == 1 else 's'} and retained nothing that met the confirmation "
            f"threshold. All observations below require validation before asserting exposure."
        )

    top = confirmed[0]
    host = top["host"] or "the primary host"
    proof = top.get("proof") or []
    proof_bit = ""
    if proof:
        proof_bit = (
            f" Proof: {proof[0]['source']} reports {proof[0]['detail']}"
            + (f"; {proof[1]['source']} reports {proof[1]['detail']}" if len(proof) > 1 else "")
            + "."
        )

    sem = top.get("confidence") or {}
    primary = (sem.get("primary") or {})
    primary_label = {
        "observation": "observation",
        "correlation": "correlation",
        "exploit": "exploit",
    }.get(str(primary.get("metric") or ""), "observation")
    primary_score = primary.get("score", top.get("machine_confidence"))

    parts: list[str] = [
        f"{top['title']} on {host} is the strongest retained exposure "
        f"({primary_score}% {primary_label} confidence, {top['status'].lower()})."
        f"{proof_bit}"
    ]

    if cross_source_matches:
        parts.append(
            f"{cross_source_matches} finding"
            f"{'' if cross_source_matches == 1 else 's'} were independently corroborated across "
            f"{source_count} scanner{'s' if source_count != 1 else ''}, which raised confidence "
            f"above single-source observation."
        )
    else:
        parts.append(
            "Evidence currently rests on "
            f"{len(top.get('sources') or []) or 1} scanner source"
            f"{'' if len(top.get('sources') or []) == 1 else 's'} — cross-source agreement is limited."
        )

    if classification:
        parts.append(f"Overall attack surface risk is classified {classification.upper()}.")

    return " ".join(parts)


def build_investigation_timeline(
    *,
    confirmed: list[dict],
    correlations: list[dict],
    validated_count: int,
    rejected_count: int,
) -> list[dict[str, str]]:
    """Analyst progression timeline — discovery → confirmation → retention."""
    if not confirmed:
        return [
            {"event": "Evidence ingested", "detail": "No findings met retention threshold", "kind": "intake"},
            {"event": "Investigation closed", "detail": "Nothing retained", "kind": "close"},
        ]

    top = confirmed[0]
    title = str(top.get("title") or "Finding")
    host = str(top.get("host") or "target")
    steps: list[dict[str, str]] = [
        {
            "event": f"{title} discovered",
            "detail": f"Observed on {host}",
            "kind": "discovery",
        }
    ]

    if "Version matched" in (top.get("validated_checks") or []):
        steps.append(
            {
                "event": "Version confirmed",
                "detail": "Service fingerprint matched reported version",
                "kind": "confirm",
            }
        )
    elif top.get("proof"):
        steps.append(
            {
                "event": "Evidence attached",
                "detail": f"{top['proof'][0]['source']}: {top['proof'][0]['detail']}",
                "kind": "confirm",
            }
        )

    if top.get("cve") and "CVE matched" in (top.get("validated_checks") or []):
        steps.append(
            {
                "event": "CVE matched",
                "detail": str(top.get("cve")),
                "kind": "cve",
            }
        )
    elif top.get("cve"):
        steps.append(
            {
                "event": "CVE associated",
                "detail": f"{top.get('cve')} — applicability not fully confirmed",
                "kind": "cve",
            }
        )

    base = int(top.get("base_confidence") or top.get("machine_confidence") or 0)
    final = int(top.get("final_confidence") or top.get("machine_confidence") or 0)
    if final > base:
        steps.append(
            {
                "event": "Confidence increased",
                "detail": f"{base}% → {final}%",
                "kind": "confidence",
            }
        )
    elif correlations:
        corr = correlations[0]
        b = corr.get("base_confidence")
        f = corr.get("final_confidence") or corr.get("confidence")
        if b is not None and f is not None and int(f) > int(b):
            steps.append(
                {
                    "event": "Confidence increased",
                    "detail": f"{b}% → {f}% via scanner agreement",
                    "kind": "confidence",
                }
            )

    if validated_count:
        steps.append(
            {
                "event": "Attack path retained",
                "detail": f"{validated_count} validated · {rejected_count} rejected",
                "kind": "path",
            }
        )
    else:
        steps.append(
            {
                "event": "Finding retained",
                "detail": f"{title} kept at {final}% confidence",
                "kind": "retention",
            }
        )

    return steps[:8]
