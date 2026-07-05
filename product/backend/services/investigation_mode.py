"""Resolve combined vs separate multi-file investigation mode."""

from __future__ import annotations

SEPARATE_KEYWORDS = (
    "separate",
    "individually",
    "each file",
    "separate reports",
    "separate report",
    "treat independently",
    "analyze one by one",
    "one by one",
    "independently",
    "different environments",
    "different environment",
)

COMBINED_KEYWORDS = (
    "correlate",
    "combined",
    "merge",
    "single investigation",
    "same environment",
    "together",
)


def resolve_investigation_mode(
    *,
    file_count: int,
    prompt: str | None = None,
    explicit: str | None = None,
) -> str:
    """Return ``combined`` or ``separate`` before the engine runs."""
    if file_count <= 1:
        return "combined"

    normalized = (explicit or "").strip().lower()
    if normalized in {"combined", "separate"}:
        return normalized

    text = (prompt or "").lower()
    if text:
        if any(keyword in text for keyword in SEPARATE_KEYWORDS):
            return "separate"
        if any(keyword in text for keyword in COMBINED_KEYWORDS):
            return "combined"

    return "combined"
