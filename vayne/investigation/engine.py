"""Investigation Engine (Priorities 1, 3, 5, 13).

Assembles a single reproducible investigation for a finding: it never jumps to a
conclusion, but moves evidence through staged reasoning (collect → observe →
hypothesize → consider alternatives → validate → update confidence → conclude →
recommend), exposes independent investigation-confidence dimensions each with its
own reasoning, and writes a human-level, evidence-derived conclusion.
"""

from __future__ import annotations

from typing import Any

from vayne.business.impact import compute_business_impact
from vayne.contradiction import build_conflicts
from vayne.evidence.quality import aggregate_quality
from vayne.investigation.attack_story import build_attack_story
from vayne.investigation.evidence_primitives import primitives_for
from vayne.investigation.hypotheses import build_hypotheses
from vayne.investigation.notebook import build_notebook
from vayne.investigation.self_challenge import run_self_challenge
from vayne.investigation.tasks import build_investigation_tasks
from vayne.models import AttackPath, CorrelatedFinding, ValidationResult
from vayne.reasoning import build_confidence_timeline, build_reasoning
from vayne.service_intel import get_profile
from vayne.validation import run_validation_loop


def _clamp(n: float) -> int:
    return max(0, min(100, int(round(n))))


def build_investigation(
    finding: CorrelatedFinding,
    validation: ValidationResult,
    attack_paths: list[AttackPath] | None = None,
) -> dict[str, Any]:
    attack_paths = attack_paths or []
    quality = aggregate_quality(finding.findings or [])
    profile = get_profile(finding)
    conflicts = [c.as_dict() for c in build_conflicts(finding)]
    business_impact = compute_business_impact(finding, validation, profile, attack_paths)
    reasoning = build_reasoning(finding, validation, profile, quality, conflicts)
    timeline = build_confidence_timeline(finding, validation)

    primitives = primitives_for(finding)
    hypotheses = build_hypotheses(finding, validation, quality)
    self_challenge = run_self_challenge(finding, validation, quality)
    attack_story = build_attack_story(finding, validation, profile, business_impact, attack_paths)
    tasks = build_investigation_tasks(finding, validation)
    notebook = build_notebook(finding, validation, timeline, primitives, self_challenge)

    # Phase 4 — ground-truth validation loop. Distinguishes verified evidence
    # from observed evidence and emits the concrete probes that would confirm it.
    validation_loop = run_validation_loop(finding, validation).as_dict()

    inv_conf = _investigation_confidence(
        finding, validation, business_impact, attack_paths, self_challenge, validation_loop
    )
    stages = _stages(finding, validation, primitives, hypotheses, tasks, inv_conf)
    conclusion = _conclusion(finding, validation, quality, business_impact, self_challenge)

    return {
        "stages": stages,
        "evidence_primitives": primitives,
        "hypotheses": hypotheses,
        "confidence_evolution": timeline,
        "self_challenge": self_challenge,
        "attack_story": attack_story,
        "investigation_tasks": tasks,
        "notebook": notebook,
        "human_reasoning": reasoning,
        "conclusion": conclusion,
        "investigation_confidence": inv_conf,
        "validation_loop": validation_loop,
    }


def _investigation_confidence(
    finding: CorrelatedFinding,
    validation: ValidationResult,
    business_impact: dict[str, Any],
    attack_paths: list[AttackPath],
    self_challenge: dict[str, Any],
    validation_loop: dict[str, Any] | None = None,
) -> dict[str, Any]:
    fid = f"vuln:{finding.id}"
    touching = [p for p in attack_paths if any(getattr(n, "id", "") == fid for n in p.nodes)]
    attack_path_conf = max([int(p.confidence or 0) for p in touching], default=0)

    validation_loop = validation_loop or {}
    vloop_delta = int(validation_loop.get("confidence_delta") or 0)
    vloop_confirmed = bool(validation_loop.get("exploit_confirmed"))
    # The exploitability dimension is upgraded ONLY by real verification evidence
    # present in the scan (authenticated / reproduced). Otherwise it is inferred.
    base_exploit = int(validation.exploit_confidence or 0)
    exploit_score = _clamp(base_exploit + vloop_delta)
    if vloop_confirmed:
        exploit_reasoning = (
            f"Exploitability is CONFIRMED by verification evidence (+{vloop_delta}); "
            f"{(validation_loop.get('verification') or {}).get('label', 'confirmed')}."
        )
    elif vloop_delta > 0:
        exploit_reasoning = (
            f"Likelihood of exploitation given CVE applicability; corroboration "
            f"adds +{vloop_delta}, but reproduction is still required to confirm."
        )
    else:
        exploit_reasoning = (
            "Likelihood of exploitation is INFERRED — no replay, authenticated "
            "re-check, or reproduction has verified it yet."
        )

    dims: dict[str, dict[str, Any]] = {
        "observation": {
            "score": int(validation.observation_confidence or 0),
            "reasoning": "Certainty the asset/service/vulnerability exists, from fingerprint and reachability evidence.",
        },
        "evidence_reliability": {
            "score": int(validation.reliability_confidence or 0),
            "reasoning": "Trust in the evidence itself, weighted by reliability tier, authentication, and spoofability.",
        },
        "exploitability": {
            "score": exploit_score,
            "verified": vloop_confirmed,
            "reasoning": exploit_reasoning,
        },
        "business_impact": {
            "score": int(business_impact.get("score") or 0),
            "reasoning": business_impact.get("summary", ""),
        },
        "attack_path": {
            "score": attack_path_conf,
            "reasoning": (
                f"Highest confidence of {len(touching)} accepted attack path(s) traversing this finding."
                if touching else "This finding is not (yet) part of an accepted attack path."
            ),
        },
    }

    # Overall investigation confidence: evidence-weighted blend of active dims,
    # then softly penalized by unresolved self-challenges (never hidden).
    weights = {
        "observation": 0.28, "evidence_reliability": 0.22, "exploitability": 0.22,
        "business_impact": 0.14, "attack_path": 0.14,
    }
    active = [(dims[k]["score"], w) for k, w in weights.items() if dims[k]["score"] > 0]
    total_w = sum(w for _, w in active)
    base = sum(s * w for s, w in active) / total_w if total_w else dims["observation"]["score"]
    penalty = min(0, self_challenge.get("net_confidence_effect", 0))
    overall = _clamp(base + penalty * 0.4)

    dims["overall_investigation"] = {
        "score": overall,
        "reasoning": (
            "Weighted blend of observation, evidence reliability, exploitability, business impact, "
            f"and attack-path confidence, reduced by {abs(int(penalty))} pts of unresolved self-challenge doubt."
        ),
    }
    return dims


def _stages(
    finding: CorrelatedFinding,
    validation: ValidationResult,
    primitives: list[dict[str, Any]],
    hypotheses: list[dict[str, Any]],
    tasks: list[dict[str, Any]],
    inv_conf: dict[str, Any],
) -> list[dict[str, Any]]:
    primary = hypotheses[0] if hypotheses else {}
    alternatives = [h for h in hypotheses if h.get("category") != "primary"]
    checks_passed = sum(
        1 for k in ("host_alive", "port_open", "service_exists", "version_matches",
                    "cve_applicable", "reachable", "reproducible")
        if getattr(validation, k, False)
    )
    return [
        _stage("Evidence Collected", "done",
               f"{len(primitives)} evidence primitive(s): "
               + ", ".join(p["display"] for p in primitives[:6])),
        _stage("Observation", "done",
               f"Observation confidence {inv_conf['observation']['score']}%"),
        _stage("Hypothesis Created", "done",
               f"Leading hypothesis: {primary.get('label', 'n/a')} ({primary.get('probability', 0)}%)"),
        _stage("Alternative Explanations", "done",
               "; ".join(f"{h['label']} ({h['probability']}%)" for h in alternatives) or "none"),
        _stage("Evidence Validation", "done",
               f"{checks_passed} validation check(s) satisfied"),
        _stage("Confidence Updated", "done",
               f"Overall investigation confidence {inv_conf['overall_investigation']['score']}%"),
        _stage("Conclusion", "done", getattr(validation.classification, "value", str(validation.classification))),
        _stage("Recommendation",
               "pending" if tasks else "none",
               f"{len(tasks)} investigation task(s) queued" if tasks else "no open evidence gaps"),
    ]


def _stage(name: str, status: str, detail: str) -> dict[str, Any]:
    return {"stage": name, "status": status, "detail": detail}


def _conclusion(
    finding: CorrelatedFinding,
    validation: ValidationResult,
    quality,
    business_impact: dict[str, Any],
    self_challenge: dict[str, Any],
) -> str:
    entity = finding.canonical_entity
    label = (entity.label if entity else finding.title) or finding.title
    version = entity.version if entity else ""
    src_count = len({(f.source_tool or "") for f in finding.findings}) or 1

    parts: list[str] = []
    if version:
        parts.append(
            f"{label} was identified from {src_count} "
            f"{'independent fingerprints' if src_count > 1 else 'fingerprint'}."
        )
    else:
        parts.append(f"{label} was observed but no exact version was confirmed.")

    if validation.cve_applicable and finding.cve:
        parts.append(f"The observed version maps to {finding.cve}.")

    if validation.reproducible or str(validation.exploitability_status) == "confirmed":
        parts.append("Exploitation has been reproduced.")
        verdict = "validated compromise"
    else:
        parts.append("However, exploitation has not been reproduced.")
        if not quality.authenticated:
            parts.append("No authenticated validation exists.")
        verdict = "observed exposure rather than a validated compromise"

    parts.append(f"Therefore the engine retains this as an {verdict}.")
    return " ".join(parts)
