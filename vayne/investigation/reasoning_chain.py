"""Structured reasoning chain for analyst investigations (Rule 5)."""

from __future__ import annotations

from typing import Any

from vayne.models import AttackPath, InvestigatedFinding


def build_reasoning_chain(
    *,
    members: list[InvestigatedFinding],
    cluster: dict[str, Any],
    attack_paths: list[AttackPath],
) -> dict[str, Any]:
    """Observation → hypothesis → evidence → contradictions → alternatives → conclusion."""
    titles = [m.correlated.title for m in members if m.correlated.title]
    observation = _observation(members, cluster)
    hypothesis = str(cluster.get("reason") or cluster.get("title") or "Security risk cluster")
    evidence = _evidence(members, cluster)
    contradictions = _contradictions(members)
    alternatives = _alternatives(members)
    most_likely = _most_likely(cluster, members, attack_paths)
    validation = _recommended_validation(members, cluster)
    confidence = int(cluster.get("confidence") or 0)

    return {
        "observation": observation,
        "hypothesis": hypothesis,
        "evidence": evidence[:10],
        "contradictions": contradictions[:6],
        "alternative_explanations": alternatives[:4],
        "most_likely_explanation": most_likely,
        "recommended_validation": validation[:6],
        "final_confidence": confidence,
        "member_titles": titles[:6],
    }


def _observation(members: list[InvestigatedFinding], cluster: dict[str, Any]) -> str:
    sources = cluster.get("evidence_sources") or []
    assets = cluster.get("affected_assets") or []
    if not members:
        return "Attack path or hypothesis flagged without retained scanner findings."
    lead = members[0].correlated.title
    src = f" from {', '.join(sources[:3])}" if sources else ""
    host = f" on {assets[0]}" if assets else ""
    return f"Scanners reported {lead}{host}{src}."


def _evidence(members: list[InvestigatedFinding], cluster: dict[str, Any]) -> list[str]:
    items: list[str] = list(cluster.get("evidence_items") or [])
    for item in members:
        intel = item.intelligence or {}
        for line in intel.get("reasoning") or []:
            s = str(line).strip()
            if s and s not in items:
                items.append(s[:200])
        inv = intel.get("investigation") or {}
        for prim in inv.get("evidence_primitives") or []:
            label = str(prim.get("label") or prim.get("kind") or "").strip()
            if label and label not in items:
                items.append(label[:160])
    return items


def _contradictions(members: list[InvestigatedFinding]) -> list[str]:
    out: list[str] = []
    for item in members:
        intel = item.intelligence or {}
        for c in intel.get("conflicts") or []:
            detail = str(c.get("detail") or c.get("kind") or "").strip()
            if detail:
                out.append(detail)
        for c in item.validation.contradicting_evidence or []:
            s = str(c).strip()
            if s and s not in out:
                out.append(s)
    return out


def _alternatives(members: list[InvestigatedFinding]) -> list[str]:
    alts: list[str] = []
    for item in members:
        inv = (item.intelligence or {}).get("investigation") or {}
        for hyp in inv.get("hypotheses") or []:
            if hyp.get("category") != "primary":
                label = str(hyp.get("label") or hyp.get("title") or "").strip()
                if label:
                    alts.append(label)
        sc = inv.get("self_challenge") or {}
        for alt in sc.get("alternative_explanations") or []:
            s = str(alt).strip()
            if s and s not in alts:
                alts.append(s)
    return alts


def _most_likely(
    cluster: dict[str, Any],
    members: list[InvestigatedFinding],
    paths: list[AttackPath],
) -> str:
    path = cluster.get("path")
    if path and path.get("steps"):
        chain = " → ".join(str(s) for s in path["steps"][:6])
        return f"Most likely abuse path: {chain}."
    if members and members[0].correlated.cve:
        return (
            f"CVE {members[0].correlated.cve} is applicable to the observed software "
            "and warrants validation before dismissing."
        )
    return str(cluster.get("reason") or cluster.get("title") or "Clustered evidence indicates actionable risk.")


def _recommended_validation(
    members: list[InvestigatedFinding],
    cluster: dict[str, Any],
) -> list[str]:
    tasks: list[str] = []
    for item in members:
        inv = (item.intelligence or {}).get("investigation") or {}
        for t in inv.get("investigation_tasks") or []:
            title = str(t.get("title") or "").strip()
            if title and title not in tasks:
                tasks.append(title)
    for m in cluster.get("missing_evidence") or []:
        s = str(m).strip()
        if s and s not in tasks:
            tasks.append(s)
    if cluster.get("immediate_action"):
        tasks.insert(0, str(cluster["immediate_action"]))
    return tasks
