# Step B — Capability Transition Validation Layer

**Status:** Complete · **Scope:** validation layer only (no path-generation changes)
**Backward compatibility:** strict — Metasploitable output unchanged.

## 1. What was added

### Capabilities (`vayne/models.py` → `AttackCapability`)
The enum now covers the full attacker kill-chain vocabulary:

| Capability | Notes |
|---|---|
| `INITIAL_ACCESS` | existing |
| `EXECUTION` | **new** — canonical post-access stage |
| `CODE_EXECUTION` | existing — kept as a backward-compat **alias** of `EXECUTION` |
| `CREDENTIAL_ACCESS` | existing |
| `PRIVILEGE_ESCALATION` | existing |
| `LATERAL_MOVEMENT` | existing |
| `PERSISTENCE` | existing |
| `DATA_ACCESS` | existing |
| `DOMAIN_COMPROMISE` | **new** |

`CODE_EXECUTION` is normalized to `EXECUTION` for all matrix lookups, so the
existing graph vocabulary (which emits `code_execution`) and the new vocabulary
are treated as equivalent. No existing enum member was renamed or removed.

### Transition matrix (`vayne/attack_paths/capabilities.py`)
`CAPABILITY_TRANSITIONS` is an explicit adjacency map of legal stage-to-stage
moves. It is a strict **superset** of the user-specified matrix:

```
INITIAL_ACCESS      -> EXECUTION, CREDENTIAL_ACCESS, LATERAL_MOVEMENT
EXECUTION           -> EXECUTION, CREDENTIAL_ACCESS, PRIVILEGE_ESCALATION,
                       LATERAL_MOVEMENT, PERSISTENCE
CREDENTIAL_ACCESS   -> EXECUTION, CREDENTIAL_ACCESS, PRIVILEGE_ESCALATION,
                       LATERAL_MOVEMENT, DATA_ACCESS
PRIVILEGE_ESCALATION-> PRIVILEGE_ESCALATION, CREDENTIAL_ACCESS, LATERAL_MOVEMENT,
                       DATA_ACCESS, DOMAIN_COMPROMISE, PERSISTENCE
LATERAL_MOVEMENT    -> LATERAL_MOVEMENT, EXECUTION, CREDENTIAL_ACCESS,
                       PRIVILEGE_ESCALATION, DATA_ACCESS, DOMAIN_COMPROMISE
DATA_ACCESS         -> DATA_ACCESS, LATERAL_MOVEMENT, DOMAIN_COMPROMISE, PERSISTENCE
DOMAIN_COMPROMISE   -> DOMAIN_COMPROMISE, DATA_ACCESS, PERSISTENCE
PERSISTENCE         -> PERSISTENCE
```

All seven required transitions are included verbatim:
`INITIAL_ACCESS→EXECUTION`, `EXECUTION→PRIVILEGE_ESCALATION`,
`EXECUTION→LATERAL_MOVEMENT`, `PRIVILEGE_ESCALATION→LATERAL_MOVEMENT`,
`LATERAL_MOVEMENT→DATA_ACCESS`, `LATERAL_MOVEMENT→DOMAIN_COMPROMISE`,
`DATA_ACCESS→PERSISTENCE`.

Privilege-escalation ↔ lateral-movement **loops** are intentionally allowed
(`PRIVILEGE_ESCALATION↔LATERAL_MOVEMENT`), modeling escalate → move → escalate
on the next host.

### New functions
- `transition_allowed(src, dst)` — single-pair check, alias-aware.
- `transitions_are_valid(chain)` — validates every adjacent pair, returns
  `(ok, issues)` with a named reason per impossible transition.

### Node→capability map (forward-prep)
`NODE_CAPABILITIES` was extended with Phase-2 node types
(`secret`, `api_key`, `ssh_key`, `role`, `iam_role`, `admin`, `domain`,
`rds`, `redis`, `bucket`, …). These node types do not appear in current scan
data, so the additions are inert for existing outputs but ready for later steps.

## 2. How it is wired in
In `vayne/attack_paths/path_reasoning.py::validate_full_path`, after the existing
`chain_is_logical` check, the path's capability chain is also run through
`transitions_are_valid`. Any impossible transition is appended to the path's
reject reasons (and therefore surfaces in proof mode).

This is purely a **rejection gate**. It does not enumerate, reorder, prioritize,
or score paths — discovery heuristics are untouched.

## 3. Rejected capability chains (examples enforced)

| Requested rejection | Capability form | Result |
|---|---|---|
| `INITIAL_ACCESS → DOMAIN_COMPROMISE` | same | rejected |
| `SERVICE → DATABASE` without credentials | `INITIAL_ACCESS → DATA_ACCESS` | rejected |
| `CVE → DOMAIN_ADMIN` without privesc | `EXECUTION → DOMAIN_COMPROMISE` | rejected |
| `SOFTWARE → SECRET` without data access | `INITIAL_ACCESS → DATA_ACCESS` | rejected |

(Service/software nodes carry no capability and are skipped, so a path that
jumps straight to a high-value stage collapses to an impossible
`INITIAL_ACCESS → DATA_ACCESS`/`DOMAIN_COMPROMISE` transition and is rejected.)

## 4. Backward compatibility evidence

Baseline capture of every currently-accepted path showed only two transitions
are actually produced today:
- `initial_access → code_execution`
- `code_execution → privilege_escalation`

Both are valid under the matrix (via the `CODE_EXECUTION = EXECUTION` alias), so
**no existing path is rejected**.

Metasploitable verification:
- attack path count: **4** (unchanged)
- confidence multiset: **{83, 92, 100, 100}** (unchanged)
- risk multiset: **{6.5, 7.2, 8.6, 8.6}** (unchanged)
- paths rejected: **0** → proof mode output unchanged (no new reject reasons emitted)

Test suite: **78 passed** (64 prior + 14 new in `tests/test_capability_transitions.py`).

New tests cover: required capabilities present, valid spec transitions,
`CODE_EXECUTION` alias, full valid chain, invalid/impossible transitions,
privilege-escalation loop, lateral-movement loop, self-transition, matrix
structural sanity, and Metasploitable compatibility (count + chain validation +
no transition-based rejections).

## 5. Future limitations discovered

1. **Capability chains are coarse.** Chains are built from node *types*, not from
   evidence of an actual transition (e.g., a credential node implies
   `CREDENTIAL_ACCESS` even if the edge to it is unverified). Tightening this is
   Phase 5/6 work (evidence-gated capabilities).
2. **No prerequisite-aware transitions yet.** The matrix accepts e.g.
   `CREDENTIAL_ACCESS → DATA_ACCESS` structurally; it does not yet check that the
   specific credential unlocks the specific data store. That requires the
   credential/identity intelligence from Phase 3.
3. **`CODE_EXECUTION`/`EXECUTION` duality** is carried as an alias to avoid a
   breaking rename. A future cleanup step can migrate graph emission to
   `EXECUTION` and retire the alias once all node producers are updated.
4. **Loops are unbounded by the matrix.** Cycle/length limits are still enforced
   upstream by path discovery (`all_simple_paths`), not by the capability layer.
5. **Node→capability map for new types is unexercised.** The Phase-2 mappings
   are correct but untested against real data until those node types are emitted
   in Phase 3.

## 6. Files changed
- `vayne/models.py` — `AttackCapability` enum (+`EXECUTION`, +`DOMAIN_COMPROMISE`).
- `vayne/attack_paths/capabilities.py` — matrix, `transition_allowed`,
  `transitions_are_valid`, expanded `NODE_CAPABILITIES`.
- `vayne/attack_paths/path_reasoning.py` — wired transition check into
  `validate_full_path` (additive reject gate).
- `tests/test_capability_transitions.py` — new (14 tests).
