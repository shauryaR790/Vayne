"""Internal Self-Challenge (Priority 12).

Before retaining a finding the engine tries to *disprove* it. It asks the
skeptical questions a senior analyst would and answers each from evidence:
could the banner be fake, could the version be wrong, could a proxy have altered
the response, is replay missing, is authenticated validation missing, is the
evidence contradictory, is this a false positive, and what evidence would
overturn the conclusion. Every unresolved challenge visibly lowers confidence —
uncertainty is never hidden.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from vayne.evidence.quality import AggregateQuality, aggregate_quality
from vayne.models import CorrelatedFinding, ValidationResult


@dataclass
class Challenge:
    question: str
    answer: str
    weakens: bool
    confidence_effect: int  # <= 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "question": self.question,
            "answer": self.answer,
            "weakens": self.weakens,
            "confidence_effect": self.confidence_effect,
        }


def run_self_challenge(
    finding: CorrelatedFinding,
    validation: ValidationResult,
    quality: AggregateQuality | None = None,
) -> dict[str, Any]:
    quality = quality or aggregate_quality(finding.findings or [])
    entity = finding.canonical_entity
    is_http = _is_http(finding)
    authenticated = quality.authenticated
    spoofable = quality.min_spoofability == "high"
    n_sources = len({(f.source_tool or "") for f in finding.findings}) or 1
    conflicts = finding.conflicts or []

    challenges: list[Challenge] = []

    # Could the banner be fake?
    if spoofable and not authenticated:
        challenges.append(Challenge(
            "Could the banner be spoofed?",
            "Yes — the strongest evidence is a spoofable header/banner with no authenticated confirmation.",
            True, -8))
    else:
        challenges.append(Challenge(
            "Could the banner be spoofed?",
            "Unlikely — evidence includes a low-spoofability fingerprint or authenticated check."
            if authenticated else "Partially — banner is corroborated by an independent fingerprint.",
            False, 0))

    # Could the version be wrong?
    if not validation.version_matches or any(c.kind == "version" for c in conflicts):
        challenges.append(Challenge(
            "Could the version be wrong?",
            "Yes — version is unconfirmed or scanners disagree on it.",
            True, -6))
    else:
        challenges.append(Challenge(
            "Could the version be wrong?",
            "Unlikely — the service fingerprint is consistent with the reported version.",
            False, 0))

    # Could a proxy modify the response? (HTTP only)
    if is_http and n_sources <= 1 and not validation.reproducible:
        challenges.append(Challenge(
            "Could a proxy or load balancer have modified the response?",
            "Possibly — a single unreplayed HTTP observation cannot rule out an intermediary.",
            True, -5))

    # Is replay missing?
    if not validation.reproducible and str(validation.exploitability_status) != "confirmed":
        challenges.append(Challenge(
            "Is replay / reproduction missing?",
            "Yes — the observation has not been reproduced, so exploitability is unconfirmed.",
            True, -7))
    else:
        challenges.append(Challenge(
            "Is replay / reproduction missing?",
            "No — the result was reproduced.",
            False, 0))

    # Is authenticated validation missing?
    if not authenticated:
        challenges.append(Challenge(
            "Is authenticated validation missing?",
            "Yes — no credentialed/authenticated check confirms this from the inside.",
            True, -4))

    # Is the evidence contradictory?
    if conflicts:
        eff = -sum(min(0, c_effect(c.kind)) for c in conflicts)
        challenges.append(Challenge(
            "Is the evidence contradictory?",
            f"Yes — {len(conflicts)} contradiction(s) recorded: "
            + "; ".join(c.detail for c in conflicts[:2]) + ".",
            True, -min(15, eff)))
    else:
        challenges.append(Challenge(
            "Is the evidence contradictory?",
            "No — scanner observations are consistent.",
            False, 0))

    # Is this likely a false positive?
    fp_signals = spoofable or (n_sources <= 1 and not authenticated) or quality.best_reliability < 0.5
    challenges.append(Challenge(
        "Is this likely a false positive?",
        "Elevated risk — weak or single-source evidence." if fp_signals
        else "Low risk — evidence is reliable and/or corroborated.",
        bool(fp_signals), -6 if fp_signals else 0))

    net_effect = sum(c.confidence_effect for c in challenges)
    overturners = _overturners(finding, validation, quality, authenticated)

    weakening = [c for c in challenges if c.weakens]
    verdict = _verdict(finding, validation, weakening)

    return {
        "challenges": [c.as_dict() for c in challenges],
        "net_confidence_effect": net_effect,
        "unresolved_count": len(weakening),
        "what_would_overturn": overturners,
        "verdict": verdict,
    }


def c_effect(kind: str) -> int:
    return {"version": -13, "reachability": -18, "severity": -4}.get(kind, -8)


def _is_http(finding: CorrelatedFinding) -> bool:
    blob = f"{finding.service} {finding.title}".lower()
    return any(k in blob for k in ("http", "apache", "nginx", "iis", "web")) or finding.port in (80, 443, 8080, 8443)


def _overturners(finding, validation, quality: AggregateQuality, authenticated: bool) -> list[str]:
    out: list[str] = []
    if not validation.reproducible:
        out.append("A successful exploit replay would confirm exploitability")
    if not authenticated:
        out.append("An authenticated/credentialed check would confirm the internal state")
    if not validation.version_matches:
        out.append("An independent version fingerprint would resolve version uncertainty")
    if quality.min_spoofability == "high":
        out.append("A low-spoofability probe (handshake/NSE) would displace the spoofable banner")
    out.append("A contradicting authoritative source would downgrade or retire the finding")
    return out[:5]


def _verdict(finding: CorrelatedFinding, validation: ValidationResult, weakening: list[Challenge]) -> str:
    label = (finding.canonical_entity.label if finding.canonical_entity else finding.title) or finding.title
    if validation.reproducible:
        return f"{label} survives self-challenge with a reproduced result — retained with high confidence."
    if not weakening:
        return f"{label} survives self-challenge — no material weaknesses found; retained."
    reasons = ", ".join(sorted({_short(c.question) for c in weakening})[:3])
    return (
        f"{label} is retained as an observed exposure, not a validated compromise: "
        f"unresolved doubts remain ({reasons}). Confidence is reduced accordingly."
    )


def _short(question: str) -> str:
    q = question.lower().rstrip("?")
    if "spoof" in q:
        return "spoofable evidence"
    if "version" in q:
        return "version uncertainty"
    if "proxy" in q:
        return "possible proxy"
    if "replay" in q or "reproduc" in q:
        return "missing replay"
    if "authenticated" in q:
        return "no authenticated check"
    if "contradict" in q:
        return "contradictions"
    if "false positive" in q:
        return "false-positive risk"
    return q
