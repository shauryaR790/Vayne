"""Deterministic attack story generation (Phase I).

Template-driven, evidence-backed narratives assembled ONLY from structured
path fields (node labels, types, capabilities, categories). No LLM prose.
"""

from __future__ import annotations

import re

from vayne.models import AttackPath, UNKNOWN

_CVE_RE = re.compile(r"CVE-\d{4}-\d+", re.I)


def _first_matching(nodes, predicate, default: str = UNKNOWN) -> str:
    for n in nodes:
        if predicate(n):
            return n.label
    return default


def _cve_from_path(path: AttackPath) -> str:
    for n in path.nodes:
        m = _CVE_RE.search(n.label)
        if m:
            return m.group(0).upper()
        m = _CVE_RE.search(n.id)
        if m:
            return m.group(0).upper()
    return ""


def _host_from_path(path: AttackPath) -> str:
    for n in path.nodes:
        if n.node_type.value == "asset":
            return n.label
        if "192.168." in n.label or re.match(r"\d+\.\d+\.\d+\.\d+", n.label):
            return n.label
    for n in path.nodes:
        if "192.168." in n.id:
            parts = n.id.split(":")
            for p in parts:
                if re.match(r"\d+\.\d+\.\d+\.\d+", p):
                    return p
    return UNKNOWN


def _service_from_path(path: AttackPath) -> str:
    svc = _first_matching(
        path.nodes,
        lambda n: n.node_type.value == "service",
        "",
    )
    if svc:
        return svc
    sw = _first_matching(path.nodes, lambda n: n.node_type.value == "software", "")
    return sw or UNKNOWN


def _software_from_path(path: AttackPath) -> str:
    return _first_matching(path.nodes, lambda n: n.node_type.value == "software", UNKNOWN)


def _outcome_from_path(path: AttackPath) -> str:
    if path.nodes:
        last = path.nodes[-1].label
        if last and last != UNKNOWN:
            return last.lower()
    return "compromise of target asset"


def _entry_from_path(path: AttackPath) -> str:
    for n in path.nodes:
        if n.capability == "initial_access" or n.node_type.value == "endpoint":
            if "internet" in n.label.lower() or n.id.startswith("entry:"):
                return "external network entry (internet-facing exposure)"
            return n.label
    return "external attacker foothold"


def _privilege_from_path(path: AttackPath) -> str:
    caps = set(path.capability_chain)
    if "domain_compromise" in caps:
        return "domain-level compromise"
    if "privilege_escalation" in caps:
        return "elevated privileges on target host"
    if "code_execution" in caps or "execution" in caps:
        return "remote code execution (unauthenticated shell access)"
    if "credential_access" in caps:
        return "credential access"
    return "none observed beyond initial exploitation outcome"


def _lateral_from_path(path: AttackPath) -> str:
    if path.attack_category == "lateral_movement" or "lateral_movement" in path.capability_chain:
        return "lateral movement between hosts evidenced on path"
    if path.blast_radius > 1:
        return f"potential reach to {path.blast_radius} assets from terminal node (no pivot step on this path)"
    return "none on this path"


def _impact_from_path(path: AttackPath) -> str:
    if path.expected_impact and path.expected_impact != UNKNOWN:
        return path.expected_impact
    if path.risk_score >= 8.0:
        return f"high-severity compromise (risk {path.risk_score}/10) enabling {path.attack_category.replace('_', ' ')}"
    return f"moderate operational impact (risk {path.risk_score}/10)"


def generate_attack_story(path: AttackPath) -> dict:
    """Build a deterministic attack story from structured path evidence."""
    cve = _cve_from_path(path)
    host = _host_from_path(path)
    software = _software_from_path(path)
    service = _service_from_path(path)
    outcome = _outcome_from_path(path)
    cve_part = f" ({cve})" if cve else ""

    narrative = (
        f"An external attacker can exploit {software}{cve_part} "
        f"exposed via {service} to obtain {outcome} on host {host}."
    )

    return {
        "initial_foothold": _entry_from_path(path),
        "exploitation_step": (
            f"Exploit verified vulnerability{cve_part} against {software} on {service}"
            if cve
            else f"Exploit verified weakness in {software} on {service}"
        ),
        "privilege_gained": _privilege_from_path(path),
        "lateral_movement": _lateral_from_path(path),
        "target_reached": f"{outcome} on {host}",
        "business_impact": _impact_from_path(path),
        "narrative": narrative,
    }


def render_attack_story_md(paths: list[AttackPath]) -> str:
    lines = ["# Attack Stories", ""]
    for i, path in enumerate(paths, 1):
        story = path.attack_story or generate_attack_story(path)
        lines.extend([
            f"## Path {i}: {path.attack_category or 'unknown'} (risk {path.risk_score})",
            "",
            story["narrative"],
            "",
            f"- **Initial foothold:** {story['initial_foothold']}",
            f"- **Exploitation:** {story['exploitation_step']}",
            f"- **Privilege gained:** {story['privilege_gained']}",
            f"- **Lateral movement:** {story['lateral_movement']}",
            f"- **Target reached:** {story['target_reached']}",
            f"- **Business impact:** {story['business_impact']}",
            "",
        ])
    return "\n".join(lines)
