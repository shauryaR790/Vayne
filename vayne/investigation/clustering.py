"""Cluster correlated evidence into analyst-facing investigations.

Analysts investigate attack paths and security problems — not individual ports.
Findings from Nmap, Nessus, OpenVAS, Burp, Nuclei, BloodHound, cloud, and
container scans are grouped by common CVE, exploit, asset, identity, cloud
resource, attack chain, and business impact.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

_SEV_RANK = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}

_SERVICE_ONLY_RE = re.compile(
    r"(?i)^(ssh|http|https|smb|ftp|smtp|dns|telnet|rdp|vnc|pop3|imap|"
    r"mysql|postgres|mssql|redis|mongodb|snmp|ntp)\b"
)
_PORT_OBS_RE = re.compile(
    r"(?i)(server detection|service detection|open port|port \d+|"
    r"tcpwrapped|general.?service)"
)
_CVE_RE = re.compile(r"CVE-\d{4}-\d+", re.I)
_INTERNAL_SCORING = re.compile(
    r"(?i)evidence class:|composite score|\(\+\d+\)|\(-\d+\)|\(\d+/100\)|"
    r"spoofable evidence|version flagged without"
)


def _looks_like_internal_scoring(text: str) -> bool:
    return bool(_INTERNAL_SCORING.search(str(text or "").strip()))


def _analyst_reason_line(finding: dict[str, Any]) -> str:
    """Pick a human analyst line — never raw confidence factor dumps."""
    for key in ("why_it_matters",):
        val = str(finding.get(key) or "").strip()
        if val and not _looks_like_internal_scoring(val):
            return val[:220]
    for line in finding.get("reasoning") or []:
        val = str(line).strip()
        if val and not _looks_like_internal_scoring(val):
            return val[:220]
    detail = finding.get("business_impact_detail") or {}
    for key in ("importance", "attacker_gains", "potential_consequences"):
        val = str(detail.get(key) or "").strip()
        if val and not _looks_like_internal_scoring(val):
            return val[:220]
    return ""


def _finding_kind(finding: dict[str, Any]) -> str:
    return str((finding.get("confidence") or {}).get("kind") or "")


def _is_pure_service_observation(finding: dict[str, Any]) -> bool:
    """Standalone port/service banners that do not warrant an investigation."""
    kind = _finding_kind(finding)
    if kind in ("validated_exposure", "correlated_vulnerability"):
        return False
    if finding.get("cve"):
        return False

    validated = finding.get("validated_checks") or []
    exploit_signals = {
        "Arbitrary command execution",
        "Interactive shell",
        "CVE matched",
        "Privilege escalation",
        "Lateral movement",
        "Reachable from entry point",
    }
    if any(v in validated for v in exploit_signals):
        return False

    title = str(finding.get("title") or "").strip()
    if _SERVICE_ONLY_RE.match(title):
        return True
    if kind == "service_observation" and _PORT_OBS_RE.search(title):
        return True
    if kind in ("service_observation", "informational"):
        cu = str(finding.get("classification") or "").upper()
        if "LIKELY" in cu or "CONFIRMED" in cu:
            return False
        if not finding.get("cve") and kind == "service_observation":
            return True
    return False


def _product_hint(title: str) -> str:
    t = (title or "").lower()
    for token in ("apache", "nginx", "tomcat", "jenkins", "wordpress", "drupal", "iis", "openssh"):
        if token in t:
            return token
    return "service"


def _cloud_resource_hint(text: str) -> str:
    for pat in (r"s3://[\w./-]+", r"arn:aws:[\w:/-]+", r"gs://[\w./-]+"):
        m = re.search(pat, text, re.I)
        if m:
            return m.group(0)[:48]
    return "cloud"


def _cluster_key_for_finding(finding: dict[str, Any]) -> tuple[str, str]:
    """Return (cluster_type, cluster_key) for grouping."""
    cve = str(finding.get("cve") or "").strip()
    host = str(finding.get("host") or "").strip()
    title = str(finding.get("title") or "")
    title_l = title.lower()
    bi = str((finding.get("business_impact_detail") or {}).get("summary") or "")
    text = " ".join([title_l, str(finding.get("why_it_matters") or ""), bi.lower()])

    if cve:
        return ("cve", f"{cve}|{host}" if host else cve)

    if re.search(
        r"(?i)kerberos|active directory|ldap|ntlm|as-rep|kerberoast|bloodhound|"
        r"domain admin|spn|delegation|dcsync",
        text,
    ):
        return ("identity", f"identity|{host or 'domain'}")

    if re.search(r"(?i)credential|password|secret|token|hash dump|api.?key|leak", text):
        return ("identity", f"credential|{host or 'multi'}")

    if re.search(
        r"(?i)s3|bucket|blob storage|cloud storage|azure|gcp|aws|iam role|lambda|"
        r"security group|public access",
        text,
    ):
        return ("cloud", f"cloud|{host or _cloud_resource_hint(text)}")

    if re.search(r"(?i)kubernetes|k8s|kube|container escape|docker|pod|namespace|helm", text):
        return ("container", f"container|{host or 'cluster'}")

    if re.search(r"(?i)certificate|ssl.?v|tls.?v|trust chain|expired cert|self-signed", text):
        return ("certificate", f"cert|{host}")

    if re.search(r"(?i)supply chain|dependency|npm|pypi|maven|third.?party", text):
        return ("supply_chain", "supply_chain|global")

    validated = finding.get("validated_checks") or []
    if re.search(r"(?i)rce|remote code|code execution|command injection|shell", text):
        return ("exploit", f"rce|{host or 'multi'}")
    if "Arbitrary command execution" in validated or "Interactive shell" in validated:
        return ("exploit", f"rce|{host or 'multi'}")

    if "Privilege escalation" in validated or re.search(r"(?i)privilege escal|sudo|root access", text):
        return ("exploit", f"privesc|{host or 'multi'}")

    if "Lateral movement" in validated or re.search(
        r"(?i)lateral|pivot|relay|pass-the-hash|smb signing|eternalblue", text
    ):
        return ("lateral", f"lateral|{host or 'multi'}")

    if re.search(r"(?i)weak auth|default password|anonymous login|no auth|basic auth|missing mfa", text):
        return ("auth", f"auth|{host or 'multi'}")

    if "Reachable from entry point" in validated or re.search(
        r"(?i)internet.?facing|external exposure|public(ly)? accessible|perimeter", text
    ):
        return ("exposure", f"exposure|{host or 'multi'}")

    if _finding_kind(finding) == "correlated_vulnerability":
        return ("asset", f"asset|{host}|{_product_hint(title)}")

    if bi and "unknown" not in bi.lower() and "needs validation" not in bi.lower():
        digest = hashlib.sha256(bi[:96].encode()).hexdigest()[:10]
        return ("business_impact", f"impact|{host}|{digest}")

    if host and not _is_pure_service_observation(finding):
        return ("asset", f"asset|{host}|general")

    return ("observation", f"obs|{host}|{title_l[:40]}")


def _path_cluster_key(path: dict[str, Any]) -> tuple[str, str]:
    steps = [str(s) for s in (path.get("steps") or []) if s]
    if not steps:
        return ("attack_chain", "path|unknown")
    chain = "→".join(steps[:6])
    digest = hashlib.sha256(chain.encode()).hexdigest()[:12]
    return ("attack_chain", f"path|{digest}")


def _internet_facing(findings: list[dict[str, Any]]) -> bool:
    for f in findings:
        validated = f.get("validated_checks") or []
        if "Reachable from entry point" in validated:
            return True
        blob = " ".join(
            [
                str(f.get("why_it_matters") or ""),
                str((f.get("business_impact_detail") or {}).get("summary") or ""),
            ]
        ).lower()
        if "internet" in blob or "external" in blob or "public" in blob:
            return True
    return False


def _has_exploit(findings: list[dict[str, Any]]) -> bool:
    for f in findings:
        if str(f.get("confidence", {}).get("kind") or "") == "validated_exposure":
            return True
        validated = f.get("validated_checks") or []
        if any(
            v in validated
            for v in ("Arbitrary command execution", "Interactive shell", "CVE matched")
        ):
            return True
        if re.search(r"(?i)exploit|rce|remote code", str(f.get("title") or "")):
            return True
    return False


def _generate_title(
    cluster_type: str,
    findings: list[dict[str, Any]],
    *,
    path: dict[str, Any] | None = None,
) -> str:
    """Analyst-facing investigation title — never 'SSH on host'."""
    if path and path.get("status") == "VALIDATED":
        steps = path.get("steps") or []
        blob = " ".join(steps).lower()
        if "privilege" in blob or "escalat" in blob or "root" in blob:
            return "Privilege Escalation Chain"
        if "lateral" in blob or "pivot" in blob or "relay" in blob:
            return "Lateral Movement Opportunity"
        if "credential" in blob or "password" in blob or "hash" in blob:
            return "Credential Reuse"
        if _has_exploit(findings) or "rce" in blob or "exploit" in blob:
            if _internet_facing(findings):
                return "Internet-Facing Remote Code Execution"
            return "Remote Code Execution Chain"
        if "ad" in blob or "domain" in blob or "kerberos" in blob:
            return "Active Directory Weakness"
        return "Validated Attack Chain"

    cve = next((str(f.get("cve") or "").strip() for f in findings if f.get("cve")), "")
    product = _product_hint(" ".join(str(f.get("title") or "") for f in findings))
    internet = _internet_facing(findings)
    exploit = _has_exploit(findings)

    title_map: dict[str, str] = {
        "identity": "Active Directory Weakness"
        if any("kerberos" in str(f.get("title") or "").lower() for f in findings)
        else "Credential Reuse",
        "cloud": "Cloud Storage Exposure",
        "container": "Misconfigured Kubernetes"
        if any("k8" in str(f.get("title") or "").lower() for f in findings)
        else "Container Escape Risk",
        "certificate": "Certificate Trust Failure",
        "supply_chain": "Supply Chain Risk",
        "lateral": "Lateral Movement Opportunity",
        "auth": "Weak Authentication",
        "business_impact": "Business-Critical Exposure",
    }

    if cluster_type in title_map:
        return title_map[cluster_type]

    if cluster_type == "cve":
        if exploit and internet:
            if product == "apache":
                return "Internet-Facing Apache RCE"
            return "Internet-Facing Remote Code Execution"
        if exploit:
            return "Remote Code Execution"
        if internet:
            return "Public Data Exposure"
        return f"Critical Vulnerability ({cve})" if cve else "Vulnerability Cluster"

    if cluster_type == "exploit":
        if internet:
            if product == "apache":
                return "Internet-Facing Apache RCE"
            return "Internet-Facing Remote Code Execution"
        return "Remote Code Execution"

    if cluster_type == "exposure":
        if exploit:
            return "Internet-Facing Remote Code Execution"
        return "Public Data Exposure"

    if cluster_type == "attack_chain":
        return _generate_title("attack_chain", findings, path=path or {})

    if cluster_type == "asset":
        blob = " ".join(str(f.get("title") or "").lower() for f in findings)
        if "git" in blob and ("config" in blob or "disclosure" in blob):
            return "Source Code Exposure"
        if "bucket" in blob or "s3" in blob:
            return "Cloud Data Exposure"
        if "secret" in blob or "credential" in blob or "api key" in blob:
            return "Secrets Exposure"
        if exploit and internet:
            return "Internet-Facing Remote Code Execution"
        if exploit:
            return "Remote Code Execution"
        return "Security Weakness on Critical Asset"

    return "Security Investigation"


def _reason_exists(
    cluster_type: str,
    findings: list[dict[str, Any]],
    *,
    path: dict[str, Any] | None = None,
) -> str:
    sources: set[str] = set()
    for f in findings:
        sources.update(f.get("sources") or [])

    cves = sorted({str(f.get("cve") or "").strip() for f in findings if f.get("cve")})
    hosts = sorted({str(f.get("host") or "").strip() for f in findings if f.get("host")})

    if path and path.get("status") == "VALIDATED":
        return (
            f"Validated attack chain across {len(findings)} correlated signal"
            f"{'s' if len(findings) != 1 else ''} from {', '.join(sorted(sources)[:4]) or 'engine evidence'}."
        )

    if cves:
        return (
            f"{len(cves)} CVE{'s' if len(cves) != 1 else ''} ({', '.join(cves[:3])}) "
            f"corroborated by {len(sources)} scanner source{'s' if len(sources) != 1 else ''} "
            f"on {len(hosts)} asset{'s' if len(hosts) != 1 else ''}."
        )

    if len(sources) >= 2:
        return (
            f"{len(findings)} evidence signal{'s' if len(findings) != 1 else ''} from "
            f"{', '.join(sorted(sources)[:5])} converge on the same security problem."
        )

    if len(findings) > 1:
        return (
            f"{len(findings)} related findings clustered on "
            f"{', '.join(hosts[:3]) or 'in-scope assets'} — not isolated port observations."
        )

    line = _analyst_reason_line(findings[0])
    if line:
        return line
    return "Retained evidence warrants analyst review."


def _confidence_explanation(findings: list[dict[str, Any]], score: int) -> str:
    multi = max(len(f.get("sources") or []) for f in findings) if findings else 0
    validated_any = any(
        str(f.get("claim_status") or "") in ("confirmed", "suspected") for f in findings
    )
    cve_confirmed = any("CVE matched" in (f.get("validated_checks") or []) for f in findings)
    parts: list[str] = []
    if multi >= 2:
        parts.append(f"{multi} independent scanners agree")
    if cve_confirmed:
        parts.append("CVE applicability confirmed in validation")
    elif any(f.get("cve") for f in findings):
        parts.append("CVE associated — applicability not fully confirmed")
    if validated_any:
        parts.append("exploitation signals present but may need manual validation")
    if not parts:
        parts.append("single-source or observational evidence — validate before asserting compromise")
    return "; ".join(parts)


def _immediate_action(findings: list[dict[str, Any]], tier: str) -> str:
    for f in findings:
        inv = f.get("investigation") or {}
        nb = inv.get("structured_notebook") or {}
        step = str(nb.get("recommended_next_step") or "").strip()
        if step and "validate finding manually" not in step.lower():
            return step[:220]

    claim = str(findings[0].get("claim_status") or "") if findings else ""
    title = _generate_title("asset", findings)
    if claim in ("needs_validation", "unknown"):
        return f"Validate {title.lower()} in a controlled window before asserting compromise."
    if tier in ("Critical", "High"):
        return f"Prioritize manual review of {title.lower()} and confirm blast radius."
    return f"Review clustered evidence and document disposition for {title.lower()}."


def _score_cluster(
    findings: list[dict[str, Any]],
    *,
    path: dict[str, Any] | None = None,
) -> int:
    """Rank by evidence quality, business impact, exploitability, exposure, etc."""
    if not findings and not path:
        return 0

    score = 0
    sources: set[str] = set()
    max_conf = 0
    max_sev = 0
    priv = lateral = internet = exploit = manual_gap = False

    for f in findings:
        sources.update(str(s) for s in (f.get("sources") or []))
        max_conf = max(max_conf, int(f.get("machine_confidence") or 0))
        max_sev = max(max_sev, _SEV_RANK.get(str(f.get("severity") or "").lower(), 0))
        validated = f.get("validated_checks") or []
        if "Privilege escalation" in validated:
            priv = True
        if "Lateral movement" in validated:
            lateral = True
        if "Reachable from entry point" in validated:
            internet = True
        if str(f.get("confidence", {}).get("kind") or "") in ("validated_exposure", "correlated_vulnerability"):
            exploit = True
        if f.get("review_incomplete") or str(f.get("claim_status") or "") == "needs_validation":
            manual_gap = True

        bi = f.get("business_impact_detail") or {}
        for factor in bi.get("factors") or []:
            score += min(8, int(factor.get("delta") or 0))

    # Evidence quality
    score += min(22, len(sources) * 4 + len(findings) * 2)
    # Business impact / asset criticality / data sensitivity via severity + confidence
    score += max_sev * 6
    score += max_conf // 5
    # Exploitability
    if exploit or _has_exploit(findings):
        score += 14
    # Internet exposure
    if internet or _internet_facing(findings):
        score += 12
    # Privilege / lateral
    if priv:
        score += 10
    if lateral:
        score += 8
    # Attack path boost
    if path and path.get("status") == "VALIDATED":
        score = max(score, int(path.get("confidence") or 0), int(round(float(path.get("risk") or 0) * 10)))

    if manual_gap:
        score = min(score, 55)

    return min(99, max(score, max_conf))


def _attach_observations(
    clusters: dict[str, dict[str, Any]],
    observations: list[dict[str, Any]],
) -> None:
    """Merge port observations into existing host clusters — never standalone investigations."""
    host_to_cluster: dict[str, str] = {}
    for cid, cluster in clusters.items():
        for f in cluster.get("findings") or []:
            h = str(f.get("host") or "").strip()
            if h:
                host_to_cluster.setdefault(h, cid)

    for obs in observations:
        host = str(obs.get("host") or "").strip()
        if host and host in host_to_cluster:
            cid = host_to_cluster[host]
            clusters[cid]["findings"].append(obs)
            clusters[cid]["finding_ids"].append(str(obs.get("id") or ""))


def build_investigation_clusters(
    *,
    confirmed_findings: list[dict[str, Any]],
    candidate_paths: list[dict[str, Any]],
    hypotheses: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Cluster findings into analyst investigations."""
    hypotheses = hypotheses or []
    actionable: list[dict[str, Any]] = []
    observations: list[dict[str, Any]] = []

    for finding in confirmed_findings:
        if _is_pure_service_observation(finding):
            observations.append(finding)
        else:
            actionable.append(finding)

    clusters: dict[str, dict[str, Any]] = {}

    def ensure_cluster(cluster_type: str, key: str) -> dict[str, Any]:
        cid = f"{cluster_type}:{key}"
        if cid not in clusters:
            clusters[cid] = {
                "id": cid,
                "cluster_type": cluster_type,
                "cluster_key": key,
                "findings": [],
                "finding_ids": [],
                "path": None,
                "hypothesis_ids": [],
            }
        return clusters[cid]

    for path in candidate_paths:
        if path.get("status") != "VALIDATED":
            continue
        ctype, key = _path_cluster_key(path)
        cluster = ensure_cluster(ctype, key)
        cluster["path"] = path

    for finding in actionable:
        ctype, key = _cluster_key_for_finding(finding)
        if ctype == "observation":
            observations.append(finding)
            continue
        cluster = ensure_cluster(ctype, key)
        cluster["findings"].append(finding)
        cluster["finding_ids"].append(str(finding.get("id") or ""))

    _attach_observations(clusters, observations)

    # Merge single-finding asset clusters on same host when themes overlap
    _merge_host_clusters(clusters)

    investigations: list[dict[str, Any]] = []
    for cid, raw in clusters.items():
        findings = raw["findings"]
        if not findings and not raw.get("path"):
            continue
        path = raw.get("path")
        ctype = str(raw["cluster_type"])
        score = _score_cluster(findings, path=path)
        claim = _worst_claim(findings)
        tier = _tier_from_score(score, _max_severity(findings), claim)
        sources: list[str] = []
        assets: list[str] = []
        for f in findings:
            for s in f.get("sources") or []:
                if s not in sources:
                    sources.append(s)
            h = str(f.get("host") or "").strip()
            if h and h not in assets:
                assets.append(h)

        title = _generate_title(ctype, findings, path=path)
        reasons = _cluster_priority_reasons(findings, path=path, sources=sources)
        bi = _cluster_business_impact(findings)
        ev_items = _cluster_evidence_items(findings, path)
        missing = _cluster_missing_evidence(findings)

        investigations.append(
            {
                "id": cid,
                "cluster_type": ctype,
                "kind": "investigation",
                "tier": tier,
                "title": title,
                "reason": _reason_exists(ctype, findings, path=path),
                "risk_score": score,
                "confidence": score,
                "claim_status": claim,
                "priority_reasons": reasons,
                "business_impact": bi,
                "confidence_explanation": _confidence_explanation(findings, score),
                "estimated_review_minutes": _review_minutes(tier, len(findings) + len(sources)),
                "immediate_action": _immediate_action(findings, tier),
                "evidence_sources": sources[:8],
                "affected_assets": assets[:8],
                "evidence_count": len(findings) + len(sources),
                "finding_ids": [x for x in raw["finding_ids"] if x],
                "evidence_items": ev_items[:8],
                "missing_evidence": missing[:4],
                "detail_section_id": "findings" if findings else "attack-graph",
            }
        )

    tier_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    investigations.sort(
        key=lambda x: (
            tier_order.get(str(x.get("tier") or "Low"), 9),
            -int(x.get("risk_score") or 0),
            -int(x.get("evidence_count") or 0),
        )
    )
    return investigations[:12]


def _merge_host_clusters(clusters: dict[str, dict[str, Any]]) -> None:
    """Merge small same-host asset clusters into one investigation."""
    by_host: dict[str, list[str]] = {}
    for cid, cluster in list(clusters.items()):
        if cluster["cluster_type"] != "asset" or cluster.get("path"):
            continue
        for f in cluster["findings"]:
            h = str(f.get("host") or "")
            if h:
                by_host.setdefault(h, []).append(cid)

    for host, cids in by_host.items():
        if len(cids) < 2:
            continue
        primary = cids[0]
        for other in cids[1:]:
            if other not in clusters:
                continue
            clusters[primary]["findings"].extend(clusters[other]["findings"])
            clusters[primary]["finding_ids"].extend(clusters[other]["finding_ids"])
            clusters.pop(other, None)


def _worst_claim(findings: list[dict[str, Any]]) -> str:
    order = {"confirmed": 0, "suspected": 1, "observed": 2, "needs_validation": 3, "unknown": 4}
    best = "unknown"
    for f in findings:
        c = str(f.get("claim_status") or "unknown")
        if order.get(c, 9) < order.get(best, 9):
            best = c
    return best


def _max_severity(findings: list[dict[str, Any]]) -> str:
    best = "info"
    best_rank = -1
    for f in findings:
        sev = str(f.get("severity") or "info").lower()
        rank = _SEV_RANK.get(sev, 0)
        if rank > best_rank:
            best_rank = rank
            best = sev
    return best


def _tier_from_score(score: int, severity: str, claim_status: str) -> str:
    if claim_status in ("needs_validation", "unknown", "rejected"):
        return "Low" if score < 55 else "Medium"
    sev = (severity or "").lower()
    if score >= 85 or (sev == "critical" and score >= 70):
        return "Critical"
    if score >= 70 or sev == "high":
        return "High"
    if score >= 45 or sev == "medium":
        return "Medium"
    return "Low"


def _review_minutes(tier: str, evidence_count: int) -> int:
    base = {"Critical": 5, "High": 8, "Medium": 12, "Low": 15}.get(tier, 15)
    return min(30, base + max(0, evidence_count - 3))


def _cluster_business_impact(findings: list[dict[str, Any]]) -> str:
    for f in findings:
        detail = f.get("business_impact_detail") or {}
        for key in ("importance", "attacker_gains", "potential_consequences", "process_affected"):
            summary = str(detail.get(key) or "").strip()
            if (
                summary
                and "unknown" not in summary.lower()
                and "needs validation" not in summary.lower()
                and not _looks_like_internal_scoring(summary)
                and not re.search(r"\(\d+/100\)", summary)
            ):
                return summary[:220]
        exec_bi = f.get("business_impact_executive") or {}
        for key in ("customers", "brand", "operations", "compliance"):
            summary = str(exec_bi.get(key) or "").strip()
            if summary:
                return summary[:220]
    if _internet_facing(findings):
        return "Internet-facing exposure — confirm whether customer or partner data is at risk."
    return "Validate exploitation before quantifying operational or financial impact."


def _cluster_evidence_items(
    findings: list[dict[str, Any]],
    path: dict[str, Any] | None,
) -> list[str]:
    items: list[str] = []
    if path:
        items.extend(str(s) for s in (path.get("steps") or [])[:4])
    for f in findings:
        for e in (f.get("evidence") or [])[:2]:
            if e and e not in items:
                items.append(str(e)[:120])
        t = str(f.get("title") or "").strip()
        if t and not _SERVICE_ONLY_RE.match(t) and t not in items:
            items.append(t[:80])
    return items


def _cluster_missing_evidence(findings: list[dict[str, Any]]) -> list[str]:
    missing: list[str] = []
    for f in findings:
        inv = f.get("investigation") or {}
        nb = inv.get("structured_notebook") or {}
        for m in (nb.get("missing_evidence") or f.get("not_validated_checks") or [])[:2]:
            s = str(m).strip()
            if s and s not in missing:
                missing.append(s)
    return missing


def _cluster_priority_reasons(
    findings: list[dict[str, Any]],
    *,
    path: dict[str, Any] | None,
    sources: list[str],
) -> list[str]:
    reasons: list[str] = []
    if path and path.get("status") == "VALIDATED":
        reasons.append("Validated attack path survived evidence gates")
        conf = int(path.get("confidence") or 0)
        if conf >= 70:
            reasons.append(f"Path confidence {conf}%")

    if len(sources) >= 2:
        reasons.append(
            f"Corroborated by {len(sources)} scanners ({', '.join(sources[:4])})"
        )
    elif sources:
        reasons.append(f"Primary evidence from {sources[0]}")

    cves = sorted({str(f.get("cve") or "") for f in findings if f.get("cve")})
    if cves:
        reasons.append(f"CVE cluster: {', '.join(cves[:3])}")

    if _internet_facing(findings):
        reasons.append("Internet-facing or entry-point reachable exposure")
    if _has_exploit(findings):
        reasons.append("Exploitability signals present across clustered evidence")

    for f in findings:
        if f.get("review_incomplete"):
            reasons.append("Self-review flagged incomplete evidence — needs validation")
            break

    seen: set[str] = set()
    out: list[str] = []
    for r in reasons:
        k = r.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(r)
    return out[:8] or ["Clustered evidence warrants analyst review."]
