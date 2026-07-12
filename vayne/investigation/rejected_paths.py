"""Smarter Attack Graph — rejected-path reasoning (Priority 8).

A rejected path should read like an analyst's note, not a silent drop. For every
rejected path/edge the engine states its current probability, the evidence that
supports it, the evidence that is missing, the evidence against it, why it was
rejected, what would validate it, and how much confidence that validation would
add. This is additive: it reads the existing proof structures and never changes
scoring.
"""

from __future__ import annotations

import re
from typing import Any

from vayne.attack_paths.proof import GraphProof

_MISSING_HINTS = {
    "replay": "Replay / reproduce the exploit end-to-end",
    "shell": "Obtain an interactive shell on the target",
    "credential": "Recover or supply valid credentials",
    "auth": "Provide authenticated access",
    "confidence": "Raise upstream evidence quality (authenticated / reproduced)",
    "reachab": "Establish network reachability from the entry point",
    "validated finding": "Validate the terminal finding with reproduced evidence",
    "exploit": "Confirm a working exploit for the mapped CVE",
}


def _label(node_id: str) -> str:
    tail = str(node_id).split("/")[-1]
    return tail.split("@")[0] or str(node_id)


def _missing_from_reason(reason: str) -> list[str]:
    r = reason.lower()
    out: list[str] = []
    for key, hint in _MISSING_HINTS.items():
        if key in r:
            out.append(hint)
    return out


def _expected_increase(missing: list[str]) -> int:
    # Each concrete piece of missing evidence, once supplied, lifts confidence.
    if not missing:
        return 0
    per = {"Replay / reproduce the exploit end-to-end": 22,
           "Obtain an interactive shell on the target": 18,
           "Recover or supply valid credentials": 16,
           "Provide authenticated access": 12,
           "Establish network reachability from the entry point": 15,
           "Confirm a working exploit for the mapped CVE": 20}
    return min(45, sum(per.get(m, 10) for m in missing))


def build_rejected_path_investigations(graph_proof: GraphProof | None) -> list[dict[str, Any]]:
    if graph_proof is None:
        return []

    out: list[dict[str, Any]] = []

    # Structured rejected-path proofs (Phase G) if present.
    pd = graph_proof.path_discovery
    if pd and pd.rejected_path_proofs:
        for proof in pd.rejected_path_proofs:
            reason = str(proof.get("reason") or proof.get("reject_reason") or "")
            path = proof.get("path") or proof.get("chain") or proof.get("title") or []
            if isinstance(path, list):
                chain = [_label(p) for p in path]
            else:
                chain = [s.strip() for s in re.split(r"->|→|,", str(path)) if s.strip()]
            prob = proof.get("confidence") or proof.get("probability") or 0
            missing = _missing_from_reason(reason)
            out.append(_entry(chain, int(_num(prob)), reason, missing,
                              supporting=proof.get("evidence_supporting") or [],
                              against=proof.get("evidence_against") or []))

    # Rejected edges as one-hop rejected paths.
    for edge in graph_proof.rejected_edges or []:
        reason = edge.reject_reason or "rejected by graph filter"
        chain = [_label(edge.source), _label(edge.target)]
        missing = _missing_from_reason(reason)
        supporting = [edge.evidence] if edge.evidence else []
        out.append(_entry(chain, int(edge.confidence or 0), reason, missing,
                          supporting=supporting, against=[]))

    return _dedupe(out)


def _entry(
    chain: list[str],
    probability: int,
    reason: str,
    missing: list[str],
    *,
    supporting: list[Any],
    against: list[Any],
) -> dict[str, Any]:
    missing = missing or ["Reproduce the chain end-to-end with concrete evidence"]
    return {
        "chain": chain,
        "current_probability": probability,
        "evidence_supporting": [str(s) for s in supporting][:5],
        "evidence_missing": missing,
        "evidence_against": [str(a) for a in against][:5],
        "why_rejected": reason,
        "what_would_validate": missing,
        "expected_confidence_increase": _expected_increase(missing),
        "analyst_note": (
            f"Path {' → '.join(chain)} sits at ~{probability}% and is blocked by: {reason}. "
            f"Supplying {', '.join(missing[:2]).lower()} would move it forward "
            f"(~+{_expected_increase(missing)}%)."
        ),
    }


def _num(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _dedupe(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for e in entries:
        key = " → ".join(e["chain"]) + "|" + e["why_rejected"]
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out[:40]
