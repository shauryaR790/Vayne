# Step D — Heuristic Attack Path Search Engine (Completion Report)

**Status:** COMPLETE. `networkx.all_simple_paths` replaced by a deterministic
weighted beam search with A*-style heuristic guidance and sound early pruning.
All 128 tests pass; Metasploitable output is byte-identical.

---

## 1. What changed

| Area | Before | After |
|---|---|---|
| Path discovery | `nx.all_simple_paths()` triple loop | deterministic beam search (`vayne/attack_paths/search/`) |
| Workflow | enumerate everything → validate → reject ~95% | generate likely paths → prune impossible branches early → validate survivors |
| Ordering | `sort(key=risk)` (stable, tie = enumeration order) | deterministic: risk DESC, confidence DESC, criticality DESC, node_id ASC |
| Validation | `validate_full_path` / `compute_path_confidence` / `score_path` | **unchanged** — search only changes *how paths are found* |

The legacy enumerator is retained behind a flag (`SEARCH_MODE = "all_simple_paths"`)
for A/B parity verification.

---

## 2. New package `vayne/attack_paths/search/`

| File | Responsibility |
|---|---|
| `search_state.py` | immutable `SearchState` (tuples/frozensets) + `SearchContext` (precomputed criticality, reachability, distance-to-target) + shared capability helpers |
| `priority.py` | `DeterministicFrontier` (min-heap) + total-order `priority_key` |
| `heuristics.py` | `heuristic_score` — A* `f = g·(1+h)·tier_weight` |
| `pruning.py` | `should_prune` — sound early rejection |
| `beam_search.py` | beam loop + state expansion; `BEAM_WIDTH=100`, `MAX_DEPTH=12`, `MAX_PATHS=100` |
| `search_engine.py` | `find_attack_paths` public entry + flag dispatch + legacy fallback |

---

## 3. Algorithm

Best-first beam search over an explicit priority frontier:

1. push initial states for each entry node (sorted by node_id);
2. pop the highest-priority state;
3. if its node is a target, save the path (and keep expanding for deeper targets);
4. expand sorted successors, pruning impossible branches immediately;
5. truncate the live frontier to `BEAM_WIDTH`;
6. stop at `MAX_PATHS` results or `MAX_EXPANSIONS` safety bound.

### Heuristic (deterministic, evidence-only)
```
g_value = (mean edge confidence / 100) * (1 + 0.15*privilege_level + 0.05*credential_count)
h_value = (max reachable target criticality / 10) * (0.5 + 0.5*terminal_proximity)
score   = g_value * (1 + h_value) * tier_weight
```
`tier_weight` boosts VERIFIED exploit/credential/escalation evidence and penalizes
candidate / partial / inventory-only paths — so
`internet→CVE→credential→role→RDS` outranks `internet→service→service→software`.

### Early pruning (each rule a strict subset of existing rejections)
- **loop** — revisiting a node (simple-path only, matches today);
- **max_depth** — `> 12` hops (== old `MAX_HOPS`);
- **dead_end_no_target** — node cannot reach any target;
- **impossible_transition** — violates the Step B capability matrix
  (e.g. `INITIAL_ACCESS→DOMAIN_COMPROMISE`, `EXECUTION→DATA_ACCESS`);
- **capability_regression** — fails `chain_is_logical`.

Because capabilities are prefix-monotonic and pruning never touches terminal-type,
validated-finding, or confidence checks (those stay in `validate_full_path`), no
acceptable path can be lost.

### Determinism
Sorted entries/neighbors + a total-order frontier key
`(-heuristic, -confidence, -risk, -criticality, node_id, path)` (the trailing
`path` guarantees no ties, so `heapq` can never reorder). Final ranking is also
fully deterministic.

---

## 4. Parity (verified)

`scripts/phase_d_parity_check.py` (beam vs legacy):

```
[metasploitable] beam paths=4 legacy paths=4 parity=True
[metasploitable] paths=4 confidence=[83, 92, 100, 100] risk=[6.5, 7.2, 8.6, 8.6]
[metasploitable] states_expanded=27 branches_pruned=19 prune_reasons={'dead_end_no_target': 19}
[firstrun]       beam paths=0 legacy paths=0 parity=True
[determinism]    100 runs identical
PHASE D PARITY: PASS
```
- Metasploitable: identical 4 paths, identical order, confidence `{83,92,100,100}`,
  risk `{6.5,7.2,8.6,8.6}`.
- Beam pruned 19 dead-end branches (open ports/services without verified exploits)
  that the legacy enumerator would have generated then rejected.
- Proof output unchanged (search telemetry fields are additive and not rendered in
  `log_lines`).

---

## 5. Tests (22 new, 128 total)

| File | Coverage |
|---|---|
| `tests/test_beam_search.py` | Metasploitable exact paths; beam == legacy on Metasploitable & firstrun; default algorithm; telemetry; synthetic reachability |
| `tests/test_search_pruning.py` | `internet→CVE→database`, `internet→domain admin`, `service→database`, loops, dead-ends, depth all pruned |
| `tests/test_search_heuristics.py` | exploit branch > inventory branch; verified > candidate; full good chain > inventory chain; tie-break order |
| `tests/test_search_scalability.py` | 500 nodes / ~4950 edges < 5s; deterministic; bounded results |
| `tests/test_search_determinism.py` | beam 100× identical; discovery 100× identical on Metasploitable |

---

## 6. Success criteria

- [x] all existing tests pass (128 total)
- [x] Metasploitable output unchanged (paths/confidence/risk/order/proof)
- [x] beam search replaces `all_simple_paths` (fallback retained)
- [x] deterministic ordering preserved
- [x] impossible paths pruned early
- [x] 500-node graph completes under 5 seconds
- [x] proof mode preserved
- [x] attack path quality maintained (richer credential/identity/data paths now
      prioritized; inventory/candidate paths deprioritized)

No LLMs, no ML, no probabilistic generation, no randomization, no hardcoded paths.
VAYNE remains deterministic, evidence-first, analyst-auditable, graph-based, and
explainable.

---

## 7. Configuration / rollback

- `vayne/attack_paths/search/search_engine.py :: SEARCH_MODE` — `"beam"` (default)
  or `"all_simple_paths"` (legacy fallback).
- Beam tunables in `beam_search.py`: `BEAM_WIDTH`, `MAX_DEPTH`, `MAX_PATHS`,
  `MAX_EXPANSIONS`.
