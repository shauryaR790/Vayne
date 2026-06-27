"""Attack capability model — maps graph entities to MITRE-style capabilities."""

from __future__ import annotations

from vayne.models import AttackCapability

ENTRY_CAPABILITY = AttackCapability.INITIAL_ACCESS

NODE_CAPABILITIES: dict[str, AttackCapability] = {
    # Original mappings (unchanged — drive current path validation)
    "endpoint": AttackCapability.INITIAL_ACCESS,
    "vulnerability": AttackCapability.CODE_EXECUTION,
    "credential": AttackCapability.CREDENTIAL_ACCESS,
    "identity": AttackCapability.PRIVILEGE_ESCALATION,
    "database": AttackCapability.DATA_ACCESS,
    # Phase 2 node types (forward-prep — not present in current scan data, so
    # adding them does not change existing outputs).
    "secret": AttackCapability.CREDENTIAL_ACCESS,
    "api_key": AttackCapability.CREDENTIAL_ACCESS,
    "jwt": AttackCapability.CREDENTIAL_ACCESS,
    "ssh_key": AttackCapability.CREDENTIAL_ACCESS,
    "session": AttackCapability.CREDENTIAL_ACCESS,
    "role": AttackCapability.PRIVILEGE_ESCALATION,
    "iam_role": AttackCapability.PRIVILEGE_ESCALATION,
    "service_account": AttackCapability.PRIVILEGE_ESCALATION,
    "admin": AttackCapability.PRIVILEGE_ESCALATION,
    "domain": AttackCapability.DOMAIN_COMPROMISE,
    "rds": AttackCapability.DATA_ACCESS,
    "redis": AttackCapability.DATA_ACCESS,
    "storage": AttackCapability.DATA_ACCESS,
    "bucket": AttackCapability.DATA_ACCESS,
    "message_queue": AttackCapability.DATA_ACCESS,
    "network_share": AttackCapability.DATA_ACCESS,
    "data": AttackCapability.DATA_ACCESS,
}

RELATIONSHIP_CAPABILITIES: dict[str, AttackCapability] = {
    "exposed_to": AttackCapability.INITIAL_ACCESS,
    "affects": AttackCapability.CODE_EXECUTION,
    "exploits": AttackCapability.CODE_EXECUTION,
    "grants_assume_role": AttackCapability.PRIVILEGE_ESCALATION,
    "leaks": AttackCapability.CREDENTIAL_ACCESS,
    "exposes": AttackCapability.CREDENTIAL_ACCESS,
    "references": AttackCapability.DATA_ACCESS,
    "connects_to": AttackCapability.LATERAL_MOVEMENT,
    "maps_to": AttackCapability.CODE_EXECUTION,
    "enables": AttackCapability.CODE_EXECUTION,
    "yields_access": AttackCapability.CODE_EXECUTION,
}


def capability_for_node(node_type: str, capability_override: str = "") -> AttackCapability | None:
    if capability_override:
        try:
            return AttackCapability(capability_override)
        except ValueError:
            pass
    return NODE_CAPABILITIES.get(node_type)


def capability_for_edge(relationship: str) -> AttackCapability | None:
    return RELATIONSHIP_CAPABILITIES.get(relationship)


def chain_is_logical(capabilities: list[AttackCapability]) -> tuple[bool, list[str]]:
    if not capabilities:
        return False, ["no capability chain"]
    issues: list[str] = []
    if capabilities[0] != AttackCapability.INITIAL_ACCESS:
        issues.append("path does not begin with initial_access")
    order = [
        AttackCapability.INITIAL_ACCESS,
        AttackCapability.CODE_EXECUTION,
        AttackCapability.CREDENTIAL_ACCESS,
        AttackCapability.PRIVILEGE_ESCALATION,
        AttackCapability.LATERAL_MOVEMENT,
        AttackCapability.DATA_ACCESS,
    ]
    last_idx = -1
    for cap in capabilities:
        if cap not in order:
            continue
        idx = order.index(cap)
        if idx < last_idx:
            issues.append(f"capability regression: {cap.value} after higher stage")
        last_idx = max(last_idx, idx)
    return len(issues) == 0, issues


# ---------------------------------------------------------------------------
# Capability transition validation (Step B)
#
# An explicit transition matrix expresses which capability stage may legally
# follow another. CODE_EXECUTION is normalized to EXECUTION so the original and
# new vocabulary are treated as equivalent. This is a *validation layer only*:
# it rejects logically impossible chains but does not generate or reorder paths.
# ---------------------------------------------------------------------------

_C = AttackCapability

# Map every capability into the canonical stage used by the matrix.
CANONICAL_CAPABILITY: dict[AttackCapability, AttackCapability] = {
    _C.INITIAL_ACCESS: _C.INITIAL_ACCESS,
    _C.EXECUTION: _C.EXECUTION,
    _C.CODE_EXECUTION: _C.EXECUTION,  # backward-compat alias
    _C.CREDENTIAL_ACCESS: _C.CREDENTIAL_ACCESS,
    _C.PRIVILEGE_ESCALATION: _C.PRIVILEGE_ESCALATION,
    _C.LATERAL_MOVEMENT: _C.LATERAL_MOVEMENT,
    _C.DATA_ACCESS: _C.DATA_ACCESS,
    _C.PERSISTENCE: _C.PERSISTENCE,
    _C.DOMAIN_COMPROMISE: _C.DOMAIN_COMPROMISE,
}

# Allowed forward transitions + intentional escalation/lateral loops.
CAPABILITY_TRANSITIONS: dict[AttackCapability, set[AttackCapability]] = {
    _C.INITIAL_ACCESS: {
        _C.EXECUTION,
        _C.CREDENTIAL_ACCESS,
        _C.LATERAL_MOVEMENT,
    },
    _C.EXECUTION: {
        _C.EXECUTION,
        _C.CREDENTIAL_ACCESS,
        _C.PRIVILEGE_ESCALATION,
        _C.LATERAL_MOVEMENT,
        _C.PERSISTENCE,
    },
    _C.CREDENTIAL_ACCESS: {
        _C.EXECUTION,
        _C.CREDENTIAL_ACCESS,
        _C.PRIVILEGE_ESCALATION,
        _C.LATERAL_MOVEMENT,
        _C.DATA_ACCESS,
    },
    _C.PRIVILEGE_ESCALATION: {
        _C.PRIVILEGE_ESCALATION,
        _C.CREDENTIAL_ACCESS,
        _C.LATERAL_MOVEMENT,
        _C.DATA_ACCESS,
        _C.DOMAIN_COMPROMISE,
        _C.PERSISTENCE,
    },
    _C.LATERAL_MOVEMENT: {
        _C.LATERAL_MOVEMENT,
        _C.EXECUTION,
        _C.CREDENTIAL_ACCESS,
        _C.PRIVILEGE_ESCALATION,
        _C.DATA_ACCESS,
        _C.DOMAIN_COMPROMISE,
    },
    _C.DATA_ACCESS: {
        _C.DATA_ACCESS,
        _C.LATERAL_MOVEMENT,
        _C.DOMAIN_COMPROMISE,
        _C.PERSISTENCE,
    },
    _C.DOMAIN_COMPROMISE: {
        _C.DOMAIN_COMPROMISE,
        _C.DATA_ACCESS,
        _C.PERSISTENCE,
    },
    _C.PERSISTENCE: {
        _C.PERSISTENCE,
    },
}


def _canon(cap: AttackCapability) -> AttackCapability:
    return CANONICAL_CAPABILITY.get(cap, cap)


def transition_allowed(src: AttackCapability, dst: AttackCapability) -> bool:
    """True if capability `dst` may legally follow `src`."""
    csrc, cdst = _canon(src), _canon(dst)
    if csrc == cdst:
        return True
    return cdst in CAPABILITY_TRANSITIONS.get(csrc, set())


def transitions_are_valid(
    capabilities: list[AttackCapability],
) -> tuple[bool, list[str]]:
    """Validate every adjacent capability transition against the matrix.

    Validation layer only — never generates, reorders, or prioritizes paths.
    Returns (ok, issues) where issues name each impossible transition.
    """
    if len(capabilities) < 2:
        return True, []
    issues: list[str] = []
    for src, dst in zip(capabilities[:-1], capabilities[1:]):
        if not transition_allowed(src, dst):
            issues.append(
                f"impossible capability transition: {src.value} -> {dst.value}"
            )
    return len(issues) == 0, issues
