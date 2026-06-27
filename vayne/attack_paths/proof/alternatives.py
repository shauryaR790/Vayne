"""Alternative-path proof (Phase G).

For an accepted path, the alternative paths that reached (or aimed at) the same
target but were rejected — with the reason and the confidence they would have
carried. Lets an analyst see *why this path and not that one*.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AlternativePath:
    path: list[str]
    rejected_reason: str
    confidence: int

    def to_dict(self) -> dict:
        return {
            "path": list(self.path),
            "rejected_reason": self.rejected_reason,
            "confidence": self.confidence,
        }
