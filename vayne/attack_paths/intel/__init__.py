"""Exploit-intelligence domains (Phase C).

Deterministic, evidence-first reasoning engines that extend VAYNE beyond
software -> CVE -> exploit -> access to cover:

    credential -> identity -> privilege -> lateral movement -> data -> asset

Each module is self-contained and side-effect free. None of them assume
validity: every relationship requires concrete scan evidence and returns an
applicability status of ``verified`` / ``partial`` / ``candidate`` / ``none``.
There is no LLM usage, no hardcoded attack paths, and no guessed relationships.
"""

from vayne.attack_paths.intel._common import (
    CANDIDATE,
    NONE,
    PARTIAL,
    VERIFIED,
    IntelStatus,
)

__all__ = ["VERIFIED", "PARTIAL", "CANDIDATE", "NONE", "IntelStatus"]
