"""Executive report generation (Phase I)."""

from __future__ import annotations

from vayne.models import InvestigationReport
from vayne.production.attack_surface import compute_attack_surface_score


def render_executive_report(report: InvestigationReport) -> str:
    paths = report.attack_paths
    score, surface_label, surface_proof = compute_attack_surface_score(report)
    n = len(paths)
    rce_count = sum(1 for p in paths if p.attack_category == "remote_rce")
    max_risk = max((p.risk_score for p in paths), default=0.0)
    top = sorted(paths, key=lambda p: (-p.risk_score, -p.confidence))[0] if paths else None

    lines = [
        "# Executive Report",
        "",
        "## EXECUTIVE SUMMARY",
        "",
        f"{n} verified attack path{'s were' if n != 1 else ' was'} identified.",
    ]
    if rce_count:
        lines.append(
            f"{rce_count} path{'s permit' if rce_count != 1 else ' permits'} "
            f"unauthenticated remote code execution."
        )
    if top:
        lines.append(
            f"The highest risk path scores {top.risk_score}/10 and enables "
            f"{top.nodes[-1].label if top.nodes else 'target compromise'}."
        )

    lines.extend(["", "## TOP RISKS", ""])
    for p in sorted(paths, key=lambda x: -x.risk_score)[:5]:
        lines.append(f"- **Risk {p.risk_score}/10** — {p.title[:100]} (confidence {p.confidence}%)")

    lines.extend(["", "## BUSINESS IMPACT", ""])
    if top:
        lines.append(top.expected_impact or f"Critical compromise path with blast radius {top.blast_radius} assets.")
    else:
        lines.append("No verified attack paths — limited demonstrated business impact from scan evidence.")

    lines.extend(["", "## LIKELY ATTACK PATHS", ""])
    for p in paths[:6]:
        story = p.attack_story.get("narrative", p.title) if p.attack_story else p.title
        lines.append(f"- [{p.attack_category}] {story[:160]}")

    lines.extend(["", "## MOST CRITICAL ASSETS", ""])
    assets = sorted({a.host for a in report.assets if a.host}, key=str)
    for host in assets[:8]:
        lines.append(f"- {host}")

    lines.extend(["", "## RECOMMENDED REMEDIATIONS", ""])
    lines.append("- Patch or disable services implicated in verified RCE paths")
    lines.append("- Restrict internet-facing exposure on confirmed vulnerable ports")
    lines.append("- Re-scan after remediation to validate risk reduction")

    lines.extend(["", "## MITRE COVERAGE", ""])
    tactics: list[str] = []
    for p in paths:
        for t in p.mitre_tactics:
            if t not in tactics:
                tactics.append(t)
    for t in tactics[:10]:
        lines.append(f"- {t}")

    lines.extend(["", "## ANALYST CONFIDENCE", ""])
    if paths:
        avg_conf = round(sum(p.confidence for p in paths) / len(paths))
        lines.append(f"Average path confidence: {avg_conf}% across {len(paths)} accepted paths.")
    lines.append(f"Findings retained: {report.stats.findings_retained} of {report.stats.findings_loaded} loaded.")

    lines.extend([
        "",
        "## ATTACK SURFACE SCORE",
        "",
        f"**{score}/100 — {surface_label}**",
        "",
        f"Formula: {surface_proof['formula']}",
    ])
    for f in surface_proof["factors"]:
        lines.append(f"- {f['name']}: {f['contribution']} (value={f['value']})")

    return "\n".join(lines)
