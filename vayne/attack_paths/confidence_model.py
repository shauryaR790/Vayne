"""Multiplicative confidence model — calibrated for analyst-grade scoring."""

from __future__ import annotations

from vayne.models import ValidationResult

SCANNER_RELIABILITY: dict[str, float] = {
    "nmap": 0.92,
    "nuclei": 0.92,
    "burp": 0.90,
    "httpx": 0.88,
    "nessus": 0.90,
    "openvas": 0.87,
    "naabu": 0.85,
    "katana": 0.80,
    "exploit_intel": 0.95,
    "scan": 0.82,
}

MATURITY_SCORES: dict[str, float] = {
    "weaponized": 0.98,
    "functional": 0.93,
    "high": 0.90,
    "poc": 0.72,
    "inventory": 0.92,
    "theoretical": 0.40,
    "unknown": 0.50,
}

EXPLOIT_CHAIN_ARTIFACTS = frozenset({
    "cve_candidate",
    "cve_verified",
    "cve_enrichment",
    "access_outcome",
    "cve_prerequisite",
})

FORMULA = (
    "confidence = round(100 × scanner_reliability × corroboration "
    "× exploit_maturity × applicability × environmental_evidence)"
)

# Phase E: documented path-confidence factors (previously inline magic numbers).
# Surfaced in every path ConfidenceProof. Values unchanged → parity preserved.
PATH_INFRA_WEIGHT = 0.22
PATH_EXPLOIT_WEIGHT = 0.78
PATH_INFRA_DEFAULT_MEAN = 0.82  # fallback infra mean when no infra edges present
VERIFIED_BOOST_WEAPONIZED = 1.08
VERIFIED_BOOST_DEFAULT = 1.04
VERIFIED_BOOST_EXACT_WEAPONIZED = 1.12
VERIFIED_PATH_FLOOR = 50
VERIFIED_PATH_CEILING = 99
UNVERIFIED_PATH_FACTOR = 0.78
NON_TIER1_TIER_FACTOR = 0.92
MULTI_TOOL_CORROBORATION_POINTS = 2  # additive, applied once across ≥2 tools

PATH_FORMULA = (
    "path_confidence = round(100 × (w_infra × infra_mean + w_exploit × exploit_mean) "
    "× verified_boost × tier_factor)"
)


def scanner_reliability(source_tool: str) -> float:
    return SCANNER_RELIABILITY.get((source_tool or "").lower(), 0.75)


def corroboration_factor(source_count: int, primary_tool: str = "") -> float:
    tool = (primary_tool or "").lower()
    if source_count >= 2:
        return min(1.0, 0.92 + (source_count - 2) * 0.03)
    if tool in ("burp", "nuclei", "nessus", "openvas"):
        return 0.90
    if tool in ("nmap", "httpx", "exploit_intel"):
        return 0.88
    return 0.78


def exploit_maturity_factor(maturity: str, *, public_poc: bool = False) -> float:
    base = MATURITY_SCORES.get((maturity or "unknown").lower(), 0.50)
    if public_poc:
        base = min(1.0, base + 0.05)
    return base


def applicability_factor(
    *,
    version_match_only: bool,
    prerequisites_met: bool,
    cve_verified: bool,
    candidate_only: bool = False,
) -> float:
    if cve_verified:
        return 0.97
    if candidate_only or version_match_only:
        return 0.42
    if prerequisites_met:
        return 0.90
    return 0.62


def environmental_factor(
    *,
    host_alive: bool,
    port_open: bool,
    reachable: bool,
    reproducible: bool,
    fingerprinted: bool = False,
) -> float:
    score = 0.45
    if host_alive:
        score += 0.12
    if port_open:
        score += 0.15
    if fingerprinted:
        score += 0.12
    if reachable:
        score += 0.10
    if reproducible:
        score += 0.10
    return min(1.0, score)


def compute_confidence(
    *,
    source_tool: str,
    source_count: int = 1,
    exploit_maturity: str = "unknown",
    public_poc: bool = False,
    version_match_only: bool = False,
    prerequisites_met: bool = False,
    cve_verified: bool = False,
    candidate_only: bool = False,
    host_alive: bool = True,
    port_open: bool = False,
    reachable: bool = False,
    reproducible: bool = False,
    fingerprinted: bool = False,
    validation: ValidationResult | None = None,
) -> tuple[int, list[str]]:
    if validation:
        host_alive = validation.host_alive
        port_open = validation.port_open
        reachable = validation.reachable
        reproducible = validation.reproducible
        prerequisites_met = validation.prerequisites_met
        cve_verified = validation.cve_applicable
        fingerprinted = getattr(validation, "service_fingerprinted", False)

    scanner = scanner_reliability(source_tool)
    corroboration = corroboration_factor(source_count, source_tool)
    maturity = exploit_maturity_factor(exploit_maturity, public_poc=public_poc)
    if prerequisites_met and not version_match_only:
        maturity = max(maturity, 0.88)
    applicability = applicability_factor(
        version_match_only=version_match_only,
        prerequisites_met=prerequisites_met,
        cve_verified=cve_verified,
        candidate_only=candidate_only,
    )
    environmental = environmental_factor(
        host_alive=host_alive,
        port_open=port_open,
        reachable=reachable,
        reproducible=reproducible,
        fingerprinted=fingerprinted,
    )

    product = scanner * corroboration * maturity * applicability * environmental
    confidence = int(round(product * 100))
    if candidate_only or version_match_only:
        confidence = min(55, confidence)
    else:
        confidence = min(100, confidence)

    breakdown = [
        f"scanner_reliability={scanner:.2f} ({source_tool or 'unknown'})",
        f"corroboration={corroboration:.2f} ({source_count} source(s))",
        f"exploit_maturity={maturity:.2f}",
        f"applicability={applicability:.2f}",
        f"environmental={environmental:.2f}",
        f"product={product:.3f} -> {confidence}%",
    ]
    return confidence, breakdown


def compute_observation_confidence(
    *,
    service_fingerprinted: bool,
    version_matches: bool,
    port_open: bool,
    host_alive: bool,
    source_count: int = 1,
    reproducible: bool = False,
) -> tuple[int, list[str]]:
    """Confirmed scan observations — inventory fingerprints, not exploit claims."""
    base = 68
    if host_alive:
        base += 4
    if port_open:
        base += 5
    if service_fingerprinted:
        base += 6
    if version_matches:
        base += 7
    if source_count >= 2:
        base += 4
    if reproducible:
        base += 3
    confidence = min(85, base)
    breakdown = [
        "model=observation_confidence",
        f"base=68 + fingerprint={service_fingerprinted} + version={version_matches} "
        f"+ port={port_open} -> {confidence}%",
    ]
    return confidence, breakdown


def compute_path_confidence_multiplicative(
    edge_confidences: list[int],
    *,
    all_tier1: bool,
    has_verified_exploit: bool,
    exploit_edge_confidences: list[int] | None = None,
    infra_edge_confidences: list[int] | None = None,
    weaponized: bool = False,
    exact_version: bool = False,
) -> tuple[int, list[str], "ConfidenceProof"]:
    """Path confidence + auditable ConfidenceProof. Arithmetic unchanged from the
    prior implementation (parity-preserving); each factor is now named and
    surfaced in the proof rather than applied as an anonymous boost."""
    from vayne.attack_paths.confidence_proof import ConfidenceProof

    if not edge_confidences:
        proof = ConfidenceProof(formula=PATH_FORMULA, explanation=["no edges"])
        proof.finalize(raw_score=0, normalized_score=0)
        return 0, ["no edges"], proof

    exploit_edges = exploit_edge_confidences or []
    infra_edges = infra_edge_confidences or []

    if has_verified_exploit and exploit_edges:
        infra_mean = (
            sum(infra_edges) / len(infra_edges) / 100.0
            if infra_edges
            else PATH_INFRA_DEFAULT_MEAN
        )
        exploit_mean = sum(exploit_edges) / len(exploit_edges) / 100.0
        weighted = PATH_INFRA_WEIGHT * infra_mean + PATH_EXPLOIT_WEIGHT * exploit_mean
        verified_boost = (
            VERIFIED_BOOST_WEAPONIZED if weaponized else VERIFIED_BOOST_DEFAULT
        )
        if exact_version and weaponized:
            verified_boost = VERIFIED_BOOST_EXACT_WEAPONIZED
        tier_cap = 1.0
        product = weighted * verified_boost * tier_cap
        raw = product * 100
        confidence = int(round(raw))
        confidence = min(VERIFIED_PATH_CEILING, max(VERIFIED_PATH_FLOOR, confidence))
        breakdown = [
            PATH_FORMULA,
            f"infra_mean={infra_mean:.2f} ({len(infra_edges)} edges)",
            f"exploit_mean={exploit_mean:.2f} ({len(exploit_edges)} edges)",
            f"verified_boost={verified_boost:.2f}",
            f"tier_factor={tier_cap:.2f}",
            f"path_confidence={confidence}%",
        ]
        proof = ConfidenceProof(formula=PATH_FORMULA, explanation=list(breakdown))
        proof.add("infra_confidence", round(infra_mean, 4), round(infra_mean * 100, 1),
                  evidence=[f"{len(infra_edges)} infrastructure edges"])
        proof.add("exploit_confidence", round(exploit_mean, 4), round(exploit_mean * 100, 1),
                  evidence=[f"{len(exploit_edges)} exploit-chain edges"])
        proof.add("verified_exploit", verified_boost, round(weighted * verified_boost * 100, 1),
                  evidence=["weaponized" if weaponized else "verified",
                            "exact_version" if exact_version else "version/port match"])
        proof.add("tier_factor", tier_cap, round(raw, 1),
                  evidence=["all-TIER1" if all_tier1 else "mixed-tier"])
        proof.finalize(raw_score=raw, normalized_score=confidence)
        return confidence, breakdown, proof

    mean_edge = sum(edge_confidences) / len(edge_confidences) / 100.0
    verified_boost = 1.0 if has_verified_exploit else UNVERIFIED_PATH_FACTOR
    tier_cap = 1.0 if all_tier1 else NON_TIER1_TIER_FACTOR
    product = mean_edge * verified_boost * tier_cap
    raw = product * 100
    confidence = int(round(raw))
    confidence = min(90 if not all_tier1 else 100, confidence)
    breakdown = [
        f"mean_edge_confidence={mean_edge:.2f}",
        f"verified_exploit_factor={verified_boost:.2f}",
        f"tier_factor={tier_cap:.2f}",
        f"path_confidence={confidence}%",
    ]
    proof = ConfidenceProof(formula=PATH_FORMULA, explanation=list(breakdown))
    proof.add("infra_confidence", round(mean_edge, 4), round(mean_edge * 100, 1),
              evidence=[f"{len(edge_confidences)} edges (mean)"])
    proof.add("verified_exploit", verified_boost, round(mean_edge * verified_boost * 100, 1),
              evidence=["verified" if has_verified_exploit else "unverified"])
    proof.add("tier_factor", tier_cap, round(raw, 1),
              evidence=["all-TIER1" if all_tier1 else "mixed-tier"])
    proof.finalize(raw_score=raw, normalized_score=confidence)
    return confidence, breakdown, proof
