"""Terminal attack targets — paths must end at high-value assets."""

from __future__ import annotations

from vayne.attack_paths.asset_criticality import classify_criticality


def is_terminal_target(node_id: str, node_data: dict) -> bool:
    if node_data.get("is_exploit_outcome"):
        return True
    category, weight = classify_criticality(node_id, node_data)
    if weight >= 5.5:
        return True
    return False


def terminal_criticality(node_id: str, node_data: dict) -> tuple[str, float]:
    return classify_criticality(node_id, node_data)


def termination_reasons(path: list[str], node_data: dict[str, dict]) -> list[str]:
    if not path:
        return ["empty path"]
    terminal = path[-1]
    if is_terminal_target(terminal, node_data.get(terminal, {})):
        return []

    reasons: list[str] = []
    caps = {node_data[n].get("node_type") for n in path if n in node_data}
    if "credential" not in caps and "identity" not in caps:
        reasons.append("no credentials")
    if "identity" not in caps:
        reasons.append("no privilege escalation")
    if "database" not in caps:
        reasons.append("no target asset (database/secrets/admin identity)")
    if not any(is_terminal_target(n, node_data.get(n, {})) for n in path):
        cat, _ = classify_criticality(terminal, node_data.get(terminal, {}))
        reasons.append(f"path does not end at high-value terminal (got {cat})")
    if "database" not in caps and "credential" not in caps:
        reasons.append("no lateral movement evidence")
    reasons.append("insufficient evidence to reach terminal target")
    return reasons
