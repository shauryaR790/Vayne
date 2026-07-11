"""Investigation intelligence hub (Phase 2, Priority 14).

Assembles every engine-derived fact for a finding and for the whole
investigation, so the LLM only ever explains structured output it did not
invent.
"""

from vayne.intelligence.engine import (
    build_finding_intelligence,
    build_investigation_intelligence,
)

__all__ = ["build_finding_intelligence", "build_investigation_intelligence"]
