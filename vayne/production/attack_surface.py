"""Attack surface scoring (Phase I).

Deterministic, explainable score 0–100 from named evidence factors.
No ML, no probabilistic ranking, no hidden weights.
"""

from __future__ import annotations

from vayne.models import InvestigationReport

# Named factor weights (documented in proof output).
PATH_COUNT_WEIGHT = 5.0
PATH_COUNT_CAP = 25.0
AVG_RISK_WEIGHT = 3.5
AVG_RISK_CAP = 30.0
MAX_RISK_WEIGHT = 2.0
MAX_RISK_CAP = 15.0
BLAST_WEIGHT = 0.4
BLAST_CAP = 20.0
VERIFIED_RCE_BONUS = 10.0
HIGH_CONFIDENCE_BONUS = 5.0
CREDENTIAL_EXPOSURE_BONUS = 8.0
LATERAL_CAPABILITY_BONUS = 7.0


def classify_surface(score: int) -> str:
    if score <= 20:
        return "Minimal"
    if score <= 40:
        return "Low"
    if score <= 60:
        return "Moderate"
    if score <= 80:
        return "High"
    return "Critical"


def compute_attack_surface_score(
    report: InvestigationReport,
) -> tuple[int, str, dict]:
    paths = report.attack_paths
    if not paths:
        return 0, "Minimal", {
            "score": 0,
            "classification": "Minimal",
            "factors": [],
            "formula": "no attack paths → score 0",
        }

    n = len(paths)
    avg_risk = sum(p.risk_score for p in paths) / n
    max_risk = max(p.risk_score for p in paths)
    max_blast = max(p.blast_radius for p in paths)
    verified_rce = sum(1 for p in paths if p.attack_category == "remote_rce")
    high_conf = sum(1 for p in paths if p.confidence >= 90)
    cred_paths = sum(
        1 for p in paths if p.attack_category in ("credential_attack", "cloud_attack")
    )
    lateral_paths = sum(1 for p in paths if p.attack_category == "lateral_movement")

    factors: list[dict] = []

    path_contrib = min(PATH_COUNT_CAP, n * PATH_COUNT_WEIGHT)
    factors.append({"name": "attack_path_count", "value": n, "weight": PATH_COUNT_WEIGHT, "contribution": round(path_contrib, 2)})

    avg_contrib = min(AVG_RISK_CAP, avg_risk * AVG_RISK_WEIGHT)
    factors.append({"name": "average_risk", "value": round(avg_risk, 2), "weight": AVG_RISK_WEIGHT, "contribution": round(avg_contrib, 2)})

    max_r_contrib = min(MAX_RISK_CAP, max_risk * MAX_RISK_WEIGHT)
    factors.append({"name": "maximum_risk", "value": max_risk, "weight": MAX_RISK_WEIGHT, "contribution": round(max_r_contrib, 2)})

    blast_contrib = min(BLAST_CAP, max_blast * BLAST_WEIGHT)
    factors.append({"name": "max_blast_radius", "value": max_blast, "weight": BLAST_WEIGHT, "contribution": round(blast_contrib, 2)})

    if verified_rce:
        factors.append({"name": "verified_rce_paths", "value": verified_rce, "weight": VERIFIED_RCE_BONUS, "contribution": VERIFIED_RCE_BONUS})
    if high_conf:
        factors.append({"name": "high_confidence_paths", "value": high_conf, "weight": HIGH_CONFIDENCE_BONUS, "contribution": HIGH_CONFIDENCE_BONUS})
    if cred_paths:
        factors.append({"name": "credential_exposure_paths", "value": cred_paths, "weight": CREDENTIAL_EXPOSURE_BONUS, "contribution": CREDENTIAL_EXPOSURE_BONUS})
    if lateral_paths:
        factors.append({"name": "lateral_capability_paths", "value": lateral_paths, "weight": LATERAL_CAPABILITY_BONUS, "contribution": LATERAL_CAPABILITY_BONUS})

    raw = sum(f["contribution"] for f in factors)
    score = int(min(100, round(raw)))
    label = classify_surface(score)

    proof = {
        "score": score,
        "classification": label,
        "factors": factors,
        "formula": (
            "attack_surface = min(100, sum(path_count, avg_risk, max_risk, blast, bonuses))"
        ),
    }
    return score, label, proof
