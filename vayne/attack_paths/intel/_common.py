"""Shared primitives for the Phase C intelligence domains.

Confidence here is intentionally simple, deterministic, and explainable. It is
derived only from (a) the applicability status and (b) the *count* of distinct
corroborating evidence markers actually observed. No randomness, no LLM, no
hidden lookups. Confidence is deliberately conservative: a credential observed
in isolation never reaches "verified".
"""

from __future__ import annotations

import re
from enum import Enum

VERIFIED = "verified"
PARTIAL = "partial"
CANDIDATE = "candidate"
NONE = "none"


class IntelStatus(str, Enum):
    VERIFIED = VERIFIED
    PARTIAL = PARTIAL
    CANDIDATE = CANDIDATE
    NONE = NONE


# Base confidence per status. Verified chains are evidence-corroborated; partial
# has the primary artifact plus weak corroboration; candidate is a single
# observed artifact with no corroboration.
_STATUS_BASE: dict[str, int] = {
    VERIFIED: 84,
    PARTIAL: 62,
    CANDIDATE: 45,
    NONE: 0,
}

_STATUS_CAP: dict[str, int] = {
    VERIFIED: 96,
    PARTIAL: 72,
    CANDIDATE: 55,
    NONE: 0,
}


def blob(evidence: list[str] | tuple[str, ...]) -> str:
    """Lowercased, whitespace-normalized concatenation of evidence strings."""
    return re.sub(r"\s+", " ", " ".join(evidence)).lower()


def has_any(text: str, markers: tuple[str, ...] | list[str]) -> str | None:
    """Return the first marker present in ``text`` (already lowercased), else None."""
    for m in markers:
        if m and m.lower() in text:
            return m
    return None


def derive_status(
    *, primary_found: bool, corroborated: bool, prerequisite_met: bool = True
) -> str:
    """Conservative status ladder.

    - no primary artifact            -> NONE
    - primary + corroboration + prereq -> VERIFIED
    - primary + (corroboration XOR prereq) -> PARTIAL
    - primary alone                  -> CANDIDATE
    """
    if not primary_found:
        return NONE
    if corroborated and prerequisite_met:
        return VERIFIED
    if corroborated or not prerequisite_met:
        return PARTIAL if corroborated else CANDIDATE
    return CANDIDATE


def intel_confidence(status: str, corroboration_count: int = 0) -> tuple[int, list[str]]:
    """Deterministic confidence from status + number of corroborating markers."""
    base = _STATUS_BASE.get(status, 0)
    if base == 0:
        return 0, [f"status={status} -> 0% (no evidence)"]
    bonus = min(max(corroboration_count, 0), 3) * 3
    conf = min(_STATUS_CAP[status], base + bonus)
    breakdown = [
        f"status={status} base={base}",
        f"corroboration_markers={corroboration_count} (+{bonus})",
        f"intel_confidence={conf}% (cap {_STATUS_CAP[status]}%)",
    ]
    return conf, breakdown
