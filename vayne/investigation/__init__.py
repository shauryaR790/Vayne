"""Autonomous investigation engine (Phase 3).

Turns correlated findings + validation into a reproducible *investigation*: the
engine collects evidence primitives, generates competing hypotheses, challenges
itself, watches confidence evolve, writes an attack story, derives investigation
tasks, and keeps a timestamped notebook — so a senior analyst can answer where a
conclusion came from, what supports/contradicts it, why the confidence is what
it is, and what would change it, all without the LLM.
"""

from vayne.investigation.engine import build_investigation
from vayne.investigation.rejected_paths import build_rejected_path_investigations

__all__ = ["build_investigation", "build_rejected_path_investigations"]
