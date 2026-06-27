"""Documented scoring formulas — single unified risk aligned with confidence."""

from __future__ import annotations

from vayne.models import Asset, ValidationResult

TOTAL_VALIDATION_CHECKS = 10
MIN_PATH_CONFIDENCE = 50
MIN_EDGE_CONFIDENCE = 50

CONFIDENCE_FORMULA = (
    "path_confidence = round(mean(edge.confidence_contribution for edge in path))"
)

EDGE_CONFIDENCE_FORMULA = (
    "edge.confidence_contribution = int((passed_checks / 10) * 50 "
    "+ min(25, source_count * 8) + min(25, validation_confidence * 0.25))"
)

ATTACKER_EFFORT_FORMULA = (
    "trivial = 1 step | low = 2-3 steps | moderate = 4-5 steps | high = 6+ steps"
)

RISK_SCORE_FORMULA = (
    "risk = min(10, cvss_base × maturity_factor × access_factor × auth_factor "
    "× evidence_factor × blast_factor × privilege_factor)"
)


CHECK_POINTS: dict[str, int] = {
    "host alive": 20,
    "port open": 15,
    "service identified": 15,
    "service fingerprinted": 10,
    "version identified": 15,
    "CVE applicable": 15,
    "exploit prerequisites met": 10,
    "reproduced with second tool": 10,
    "target reachable": 10,
    "privilege escalation evidenced": 8,
    "lateral movement evidenced": 8,
}


def validation_checks_passed(validation: ValidationResult | None) -> list[str]:
    if validation is None:
        return []
    mapping = {
        "host_alive": "host alive",
        "port_open": "port open",
        "service_exists": "service identified",
        "service_fingerprinted": "service fingerprinted",
        "version_matches": "version identified",
        "cve_applicable": "CVE applicable",
        "prerequisites_met": "exploit prerequisites met",
        "reachable": "target reachable",
        "reproducible": "reproduced with second tool",
        "privilege_escalation_possible": "privilege escalation evidenced",
        "lateral_movement_possible": "lateral movement evidenced",
    }
    return [label for attr, label in mapping.items() if getattr(validation, attr)]


def confidence_breakdown_from_checks(checks: list[str]) -> list[str]:
    return [f"+{CHECK_POINTS.get(c, 5)} {c}" for c in checks]


def edge_confidence_contribution(
    validation: ValidationResult | None,
    source_count: int,
    *,
    require_checks: bool = True,
) -> tuple[int, list[str]]:
    checks = validation_checks_passed(validation)
    if require_checks and not checks:
        return 0, []

    passed = len(checks)
    val_conf = validation.confidence if validation else 0
    contribution = int(
        (passed / TOTAL_VALIDATION_CHECKS) * 50
        + min(25, source_count * 8)
        + min(25, val_conf * 0.25)
    )
    return min(100, max(1, contribution)), checks


def edge_confidence(
    *,
    has_finding: bool,
    has_evidence: bool,
    validation_checks: list[str],
    validation: ValidationResult | None,
    source_count: int = 1,
) -> tuple[int, list[str]]:
    if not has_finding or not has_evidence:
        return 0, []
    contribution, _ = edge_confidence_contribution(
        validation, max(1, source_count), require_checks=bool(validation)
    )
    breakdown = confidence_breakdown_from_checks(validation_checks)
    if validation and validation.confidence_breakdown:
        breakdown = list(validation.confidence_breakdown) + breakdown
    return contribution, breakdown


def path_confidence(edge_contributions: list[int]) -> int:
    if not edge_contributions:
        return 0
    return int(sum(edge_contributions) / len(edge_contributions))


def path_meets_confidence_threshold(edge_contributions: list[int]) -> bool:
    if not edge_contributions:
        return False
    if path_confidence(edge_contributions) < MIN_PATH_CONFIDENCE:
        return False
    return all(c >= MIN_EDGE_CONFIDENCE for c in edge_contributions)


def attacker_effort_by_hops(hop_count: int) -> tuple[str, str]:
    if hop_count < 1:
        return "unknown", "hop_count=0 — insufficient path"
    if hop_count == 1:
        return "trivial", f"hop_count={hop_count} -> trivial (1 step)"
    if hop_count <= 3:
        return "low", f"hop_count={hop_count} -> low (2-3 steps)"
    if hop_count <= 5:
        return "moderate", f"hop_count={hop_count} -> moderate (4-5 steps)"
    return "high", f"hop_count={hop_count} -> high (6+ steps)"


def missing_evidence_to_continue(
    path: list[str],
    node_data: dict[str, dict],
    assets: list[Asset],
) -> list[str]:
    if len(path) < 2:
        return []

    terminal = path[-1]
    if terminal not in node_data:
        return []

    terminal_type = node_data[terminal].get("node_type", "")
    combined = " ".join(
        ev for nid in path for ev in node_data.get(nid, {}).get("evidence", [])
    ).lower()
    discovered_hosts = {a.host.lower() for a in assets}
    path_hosts = {
        node_data[nid].get("label", "").lower()
        for nid in path
        if node_data[nid].get("node_type") == "asset"
    }

    missing: list[str] = []

    if any(m in combined for m in ("database", "rds", "mysql", "postgres", "mongodb")):
        has_db = any(node_data[n].get("node_type") in ("database", "data") for n in path)
        if not has_db:
            missing.extend([
                "database connection string (postgres://, mysql://, DATABASE_URL=)",
                "RDS endpoint discovery in scan inventory",
                "leaked credential referencing database host",
                "IAM policy allowing rds:* on target",
                "network route to port 5432/3306 confirmed open",
            ])

    if any(m in combined for m in ("secret", "github", ".env", "token leak")):
        has_secret = any(
            node_data[n].get("node_type") in ("database", "bucket", "data", "credential")
            for n in path
        )
        if not has_secret:
            missing.append(
                "validated secret/credential finding with correlated tool evidence"
            )

    if terminal_type == "vulnerability" and any(
        m in combined for m in ("assume role", "sts:assume", "iam", "privilege")
    ):
        has_identity = any(node_data[n].get("node_type") == "identity" for n in path)
        if not has_identity:
            missing.append(
                "evidence of sts:AssumeRole, IAM trust policy, or validated privilege escalation"
            )

    if terminal_type in ("identity", "credential") and any(
        m in combined for m in ("reachable", "lateral", "database", "rds")
    ):
        named_target = any(
            h in combined for h in discovered_hosts if h not in path_hosts
        )
        if not named_target:
            missing.append(
                "scan discovery of target host/endpoint explicitly named in evidence "
                "(hostname or IP present in scan inventory)"
            )

    if terminal_type == "identity" and "access key" not in combined:
        if "assumerole" in combined.replace(" ", "") or "assume role" in combined:
            if not any(node_data[n].get("node_type") == "credential" for n in path):
                missing.append(
                    "evidence of exposed credential or access key used to assume the role"
                )

    return missing


def build_termination_message(missing: list[str]) -> str:
    if not missing:
        return ""
    items = "\n  - ".join(missing)
    return (
        "ATTACK PATH TERMINATED\n\n"
        f"To continue, VAYNE requires ONE of:\n  - {items}"
    )


def format_scoring_breakdown(
    *,
    edge_contributions: list[int],
    path_conf: int,
    hops: int,
    effort_calc: str,
    risk: float,
    risk_detail: str,
) -> dict[str, str]:
    edge_mean = (
        f"mean({edge_contributions}) = {path_conf}"
        if edge_contributions
        else "no edges"
    )
    return {
        "confidence_formula": CONFIDENCE_FORMULA,
        "confidence_calculation": edge_mean,
        "edge_confidence_formula": EDGE_CONFIDENCE_FORMULA,
        "attacker_effort_formula": ATTACKER_EFFORT_FORMULA,
        "attacker_effort_calculation": effort_calc,
        "risk_score_formula": RISK_SCORE_FORMULA,
        "risk_score_calculation": risk_detail,
    }
