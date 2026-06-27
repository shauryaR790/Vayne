"""Deterministic remediation plan generation (Phase I).

Rule-table driven from software/node types and attack categories.
Every item is explainable with difficulty and expected risk/confidence impact.
"""

from __future__ import annotations

from dataclasses import dataclass

from vayne.models import AttackPath, InvestigationReport

from vayne.models import Classification


@dataclass(frozen=True)
class RemediationRule:
    match_key: str
    fix: str
    difficulty: str
    risk_reduction: float
    confidence_reduction: int


RULES: tuple[RemediationRule, ...] = (
    RemediationRule("vsftpd", "Upgrade vsftpd to a patched version or disable the vulnerable service", "low", 2.5, 15),
    RemediationRule("proftpd", "Upgrade ProFTPD or restrict telnet/IAC exposure; disable if unused", "low", 2.0, 12),
    RemediationRule("samba", "Apply Samba security patch for username map script RCE; restrict SMB exposure", "medium", 2.5, 15),
    RemediationRule("tomcat", "Restrict Tomcat manager interface; apply CVE patch; require authentication", "medium", 2.0, 10),
    RemediationRule("apache", "Patch Apache/Tomcat components; restrict manager deployment interfaces", "medium", 2.0, 10),
    RemediationRule("iam_role", "Remove unnecessary AssumeRole trust; rotate credentials; apply least-privilege IAM", "medium", 3.0, 20),
    RemediationRule("credential", "Rotate exposed credentials; remove secrets from reachable storage", "low", 2.5, 18),
    RemediationRule("api_key", "Revoke and rotate API keys; restrict key scope", "low", 2.5, 18),
    RemediationRule("rds", "Restrict RDS network access; enforce IAM/database authentication", "medium", 2.0, 12),
    RemediationRule("remote_rce", "Restrict external access to exploited service; apply vendor security patch", "medium", 2.5, 15),
)


def _path_keys(path: AttackPath) -> set[str]:
    keys: set[str] = set()
    if path.attack_category:
        keys.add(path.attack_category)
    for n in path.nodes:
        keys.add(n.node_type.value)
        keys.add(n.label.lower())
    return keys


def generate_remediation_plan(report: InvestigationReport) -> dict:
    items: list[dict] = []
    seen: set[tuple[str, str]] = set()

    for rule in RULES:
        affected = []
        for path in report.attack_paths:
            keys = _path_keys(path)
            if any(rule.match_key in k for k in keys):
                affected.append(path.id)
        if not affected:
            continue
        key = (rule.fix, rule.match_key)
        if key in seen:
            continue
        seen.add(key)
        items.append({
            "match_key": rule.match_key,
            "fix": rule.fix,
            "difficulty": rule.difficulty,
            "expected_risk_reduction": rule.risk_reduction,
            "expected_confidence_reduction": rule.confidence_reduction,
            "affected_attack_paths": sorted(affected),
        })

    items.sort(key=lambda x: (-len(x["affected_attack_paths"]), x["fix"]))
    return {"items": items, "total_items": len(items)}


def render_remediation_md(plan: dict) -> str:
    lines = ["# Remediation Plan", ""]
    for i, item in enumerate(plan["items"], 1):
        lines.extend([
            f"## {i}. {item['fix']}",
            "",
            f"- **Difficulty:** {item['difficulty']}",
            f"- **Expected risk reduction:** up to {item['expected_risk_reduction']} points",
            f"- **Expected confidence reduction:** up to {item['expected_confidence_reduction']}%",
            f"- **Affected paths:** {', '.join(item['affected_attack_paths'])}",
            "",
        ])
    return "\n".join(lines)


def export_findings(report: InvestigationReport) -> dict:
    validated = []
    rejected = []
    for f in report.findings:
        entry = {
            "id": f.correlated.id,
            "title": f.correlated.title,
            "host": f.correlated.host,
            "classification": f.validation.classification.value,
            "confidence": f.validation.confidence,
            "evidence": f.correlated.evidence,
            "reasoning": f.validation.confidence_breakdown,
            "cve": f.correlated.cve,
        }
        if f.validation.classification == Classification.FALSE_POSITIVE:
            rejected.append(entry)
        else:
            validated.append(entry)
    validated.sort(key=lambda x: (x["host"], x["title"], x["cve"]))
    rejected.sort(key=lambda x: (x["host"], x["title"], x["cve"]))
    return {"validated": validated, "rejected": rejected}
