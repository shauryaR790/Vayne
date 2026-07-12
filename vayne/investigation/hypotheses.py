"""Hypothesis Engine (Priority 2).

The engine never jumps straight to a conclusion. For every finding it generates
competing explanations, scores each from the actual evidence, and normalizes the
scores to probabilities. As evidence changes, the probabilities shift — a strong
authenticated result crushes the "false fingerprint" hypothesis; a spoofable
banner keeps it alive.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from vayne.calibration import default_calibrator
from vayne.evidence.quality import AggregateQuality, aggregate_quality
from vayne.models import CorrelatedFinding, ValidationResult


@dataclass
class Hypothesis:
    id: str
    label: str
    probability: int
    supporting_evidence: list[str]
    contradicting_evidence: list[str]
    category: str  # primary | alternative | false_positive
    rationale: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "probability": self.probability,
            "supporting_evidence": self.supporting_evidence,
            "contradicting_evidence": self.contradicting_evidence,
            "category": self.category,
            "rationale": self.rationale,
        }


def build_hypotheses(
    finding: CorrelatedFinding,
    validation: ValidationResult,
    quality: AggregateQuality | None = None,
) -> list[dict[str, Any]]:
    quality = quality or aggregate_quality(finding.findings or [])
    entity = finding.canonical_entity
    kind = (entity.kind if entity else "service") or "service"
    label = (entity.label if entity else finding.title) or finding.title
    version = entity.version if entity else ""
    is_http = _is_http(finding)

    agr = finding.scanner_agreement
    agree_ratio = agr.ratio if agr else 0.0
    n_sources = len({(f.source_tool or "") for f in finding.findings}) or 1
    spoofable = quality.min_spoofability == "high"
    authenticated = quality.authenticated
    conflicts = finding.conflicts or []
    has_cve = bool(finding.cve) or kind == "vulnerability"

    # --- Raw weights (evidence-derived, later normalized) ------------------ #
    # Primary: the finding is a genuine exposure / exploitable condition.
    primary = 40
    primary += int(round(quality.best_reliability * 30))
    primary += int(round(agree_ratio * 15))
    if validation.version_matches:
        primary += 8
    if authenticated:
        primary += 12
    if validation.cve_applicable:
        primary += 8
    if spoofable:
        primary -= 8
    primary = max(5, primary)

    # Alternative: something benign explains the observation.
    if is_http:
        alt_label = "Reverse proxy / load balancer altering the response"
        alt_evidence = ["Single-vantage HTTP observation", "Server header is trivially rewritten"]
    elif kind in ("service", "software"):
        alt_label = "Service present but not exploitable (missing preconditions)"
        alt_evidence = ["Version observed without exploit reproduction"]
    else:
        alt_label = "Condition exists but is compensated by controls"
        alt_evidence = ["No confirmation the exposure is reachable/abusable"]
    alt = 12
    if is_http and n_sources <= 1:
        alt += 8
    if not validation.reproducible and has_cve:
        alt += 8
    if any(c.kind == "version" for c in conflicts):
        alt += 6
    if spoofable:
        alt += 4

    # False fingerprint / false positive.
    fp = 6
    if spoofable:
        fp += 10
    if n_sources <= 1 and not authenticated:
        fp += 8
    if quality.best_reliability < 0.5:
        fp += 8
    if conflicts:
        fp += 5
    if authenticated:
        fp = max(2, fp - 10)
    if validation.reproducible:
        fp = max(1, fp - 8)

    raw = {"primary": primary, "alternative": alt, "false_positive": fp}
    total = sum(raw.values()) or 1
    probs = {k: max(1, int(round(v / total * 100))) for k, v in raw.items()}
    # Fix rounding drift so probabilities sum to 100.
    probs["primary"] += 100 - sum(probs.values())

    primary_support = _support(finding, validation, quality)
    primary_contra = [c.detail for c in conflicts] + (
        ["Exploitation not reproduced"] if has_cve and not validation.reproducible else []
    )

    hyps = [
        Hypothesis(
            id=f"hyp:{finding.id}:primary",
            label=_primary_label(kind, label, finding.cve),
            probability=probs["primary"],
            supporting_evidence=primary_support,
            contradicting_evidence=primary_contra[:4],
            category="primary",
            rationale=(
                f"Best evidence is {quality.best_tier.lower()} reliability"
                + (", corroborated across scanners" if agree_ratio >= 0.5 else "")
                + (", authenticated" if authenticated else ", unauthenticated")
                + "."
            ),
        ),
        Hypothesis(
            id=f"hyp:{finding.id}:alt",
            label=alt_label,
            probability=probs["alternative"],
            supporting_evidence=alt_evidence,
            contradicting_evidence=(["Version fingerprint is consistent"] if validation.version_matches else []),
            category="alternative",
            rationale="A benign explanation that remains possible until directly ruled out.",
        ),
        Hypothesis(
            id=f"hyp:{finding.id}:fp",
            label="False fingerprint / not applicable",
            probability=probs["false_positive"],
            supporting_evidence=_fp_support(quality, n_sources, conflicts),
            contradicting_evidence=(["Authenticated verification present"] if authenticated else [])
            + (["Reproduced result"] if validation.reproducible else []),
            category="false_positive",
            rationale="Kept explicit so the engine never over-commits to a weakly-supported signal.",
        ),
    ]
    hyps.sort(key=lambda h: h.probability, reverse=True)
    # Attach calibration metadata so the probability is honest about whether it
    # is an uncalibrated heuristic prior or empirically calibrated.
    cal = default_calibrator()
    out: list[dict[str, Any]] = []
    for h in hyps:
        d = h.as_dict()
        cv = cal.calibrate(h.probability, "hypothesis")
        d["probability"] = int(round(cv.calibrated)) if cv.calibrated_flag else h.probability
        d["probability_raw"] = h.probability
        d["calibration"] = cv.as_dict()
        out.append(d)
    return out


def _is_http(finding: CorrelatedFinding) -> bool:
    blob = f"{finding.service} {finding.title} {' '.join(finding.evidence)}".lower()
    return any(k in blob for k in ("http", "apache", "nginx", "iis", "web")) or finding.port in (80, 443, 8080, 8443)


def _primary_label(kind: str, label: str, cve: str) -> str:
    if cve:
        return f"{label} is genuinely exposed and {cve} is applicable"
    if kind == "vulnerability":
        return f"{label} is a genuine vulnerability on this host"
    return f"{label} is genuinely running and exposed"


def _support(finding: CorrelatedFinding, validation: ValidationResult, quality: AggregateQuality) -> list[str]:
    out: list[str] = []
    if quality.items:
        best = max(quality.items, key=lambda q: q.reliability)
        out.append(f"{best.reliability_tier} {best.evidence_type.replace('_', ' ')}")
    if validation.version_matches:
        out.append("Version fingerprint consistent")
    agr = finding.scanner_agreement
    if agr and len(agr.agreed) >= 2:
        out.append(f"Corroborated by {len(agr.agreed)} detectors")
    if validation.reachable:
        out.append("Reachable from entry point")
    if validation.cve_applicable and finding.cve:
        out.append(f"{finding.cve} applicable to observed version")
    return out[:5]


def _fp_support(quality: AggregateQuality, n_sources: int, conflicts: list) -> list[str]:
    out: list[str] = []
    if quality.min_spoofability == "high":
        out.append("Highly spoofable evidence")
    if n_sources <= 1:
        out.append("Single source of evidence")
    if quality.best_reliability < 0.5:
        out.append("Weak best-evidence reliability")
    if conflicts:
        out.append("Contradictory scanner observations")
    return out or ["No strong false-positive indicators"]
