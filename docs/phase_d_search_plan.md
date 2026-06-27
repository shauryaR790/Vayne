# Phase D — Heuristic Attack Path Search Engine (Plan & Architecture Review)

**Status:** PLAN ONLY — no code changed. Awaiting approval.
**Goal:** Replace `networkx.all_simple_paths()` with a deterministic, evidence-first
weighted beam search (+ A*-style heuristic guidance + early pruning) **without
changing any validation, scoring, proof, or Metasploitable output.**

---

## 1. Architecture review of the current engine

### 1.1 Where path discovery lives
`vayne/attack_paths/discovery.py :: discover_attack_paths()`:

1. builds the graph (`SecurityGraphBuilder.build`) → `proof`
2. computes entry nodes (`is_entry`) and terminal nodes (`is_terminal_target`)
3. **enumeration** (the part Phase D replaces):
   ```python
   for entry in entries:
       for terminal in target_nodes:
           for path in islice(nx.all_simple_paths(g, entry, terminal, cutoff=MAX_HOPS),
                              PATH_ENUM_LIMIT):
               raw_count += 1
               accepted, hypothetical, reject, survive = validate_full_path(g, path, validated_ids)
               if not accepted: rejected += 1; continue
               path_conf, conf_breakdown = compute_path_confidence(...)
               if path_conf < MIN_PATH_CONFIDENCE: rejected += 1; continue
               risk, detail, contributions = score_path(g, path)
               candidates.append((risk, detail, path, contributions, hypothetical, survive, conf_breakdown))
   ```
4. **post-processing** (must stay identical):
   - `candidates.sort(key=lambda x: x[0], reverse=True)` (risk DESC)
   - take `candidates[:MAX_PATHS]`
   - `_path_to_model(...)` builds each `AttackPath`
   - `seen` set dedupes identical node-id tuples

### 1.2 What guarantees the Metasploitable "4 paths"
The Metasploitable graph is effectively a set of per-service trees:
`entry → asset → service → software → cve_cand → cve_verified → exploit → access`.
`all_simple_paths` yields ~4 raw paths (one per verified exploit terminal), all 4
pass `validate_full_path`, none rejected, and they sort by `score_path` risk into
`{8.6, 8.6, 7.2, 6.5}` with confidences `{100,100,92,83}`. The state space is tiny.

### 1.3 Validation/scoring functions that MUST be reused unchanged
- `validate_full_path(g, path, validated_ids)` — hop validation, validated-finding
  requirement, terminal-type checks, `chain_is_logical`, `transitions_are_valid`
  (Step B), `termination_reasons`.
- `compute_path_confidence(g, path, multi_tool, validated)` + `MIN_PATH_CONFIDENCE`.
- `score_path(g, path)` → `(risk, detail, contributions)`.
- `is_terminal_target` / `terminals.py`, `classify_criticality`, proof objects.

### 1.4 Problems with `all_simple_paths`
- Combinatorial blow-up on dense graphs (cloud/identity/lateral).
- Generates then rejects ~95% of paths (validation is post-hoc).
- No prioritization — capped by `PATH_ENUM_LIMIT` arbitrarily, not by value.
- Cannot scale to 500+ node enterprise graphs.

---

## 2. Design overview

New package `vayne/attack_paths/search/` (additive; nothing deleted):

| File | Responsibility |
|---|---|
| `search_state.py` | immutable `SearchState` dataclass + factory/extend helpers |
| `priority.py` | deterministic total-order priority key + frontier wrapper around `heapq` |
| `heuristics.py` | `heuristic_score(state, g, ctx)` — A* style value estimate |
| `pruning.py` | `should_prune(state, neighbor, g, ctx)` — sound early rejection |
| `beam_search.py` | the beam/A* loop producing candidate **paths** (list[str]) |
| `search_engine.py` | public entry: `find_attack_paths(g, entries, terminals, ctx)`; flag dispatch + `all_simple_paths` fallback |

**Key principle — separation of concerns:**
The search engine ONLY decides *which paths to enumerate and in what order*. Each
complete path it emits is still handed to the **unchanged** `validate_full_path` /
`compute_path_confidence` / `score_path` pipeline in `discovery.py`. Search never
accepts a path on its own authority.

---

## 3. `SearchState` (immutable)

```python
@dataclass(frozen=True)
class SearchState:
    path: tuple[str, ...]          # tuple (hashable, immutable) of node ids
    current_node: str
    confidence: int                # running lower-bound confidence estimate
    risk: float                    # running risk estimate (for tie-breaking)
    capabilities: tuple[AttackCapability, ...]
    privilege_level: int           # 0 none,1 cred,2 priv-esc,3 admin/domain
    credential_count: int
    terminal_reached: bool
    depth: int                     # == len(path) - 1
    heuristic_score: float         # f = g_cost surrogate + h (forward estimate)
    visited: frozenset[str]        # for O(1) loop checks (== set(path))
```
Notes:
- Use `tuple`/`frozenset` so states are hashable and provably immutable
  (deterministic, no aliasing). The spec's `list` fields become tuples.
- `capabilities` derived with the SAME logic as `validate_full_path` (extract via
  `capability_for_node`) so search-time capability reasoning matches validation.

---

## 4. Deterministic beam search algorithm (`beam_search.py`)

```
frontier = DeterministicFrontier()              # min-heap on priority key
for entry in sorted(entries):                   # node_id ASC
    frontier.push(initial_state(entry))

results: list[tuple[str,...]] = []
expansions = 0
while frontier and len(results) < MAX_PATHS and expansions < MAX_EXPANSIONS:
    state = frontier.pop()                       # highest priority (best first)
    expansions += 1

    if is_terminal_node(state.current_node, g):  # structural terminal check only
        results.append(state.path)
        # do NOT stop expanding other branches; a node can be both terminal
        # and have successors (mirrors all_simple_paths reaching each terminal)

    if state.depth >= MAX_DEPTH:
        continue

    for nbr in sorted(g.successors(state.current_node)):   # node_id ASC
        if should_prune(state, nbr, g, ctx):     # sound early pruning
            ctx.record_pruned(state, nbr, reason) # proof: pruned branches
            continue
        child = extend_state(state, nbr, g, ctx)
        frontier.push(child)

    frontier.truncate(BEAM_WIDTH)                 # keep best BEAM_WIDTH live states
```

Config (module constants, overridable):
```
BEAM_WIDTH      = 100
MAX_DEPTH       = 12     # == current MAX_HOPS, preserves fixture parity
MAX_PATHS       = 100    # candidate cap (discovery still applies its MAX_PATHS=50)
MAX_EXPANSIONS  = 200_000  # hard safety bound for scale test
```

**Why this preserves parity (completeness argument):**
- Pruning (`§6`) is *sound*: it only discards branches that can **never** extend to
  a path `validate_full_path` would accept. So no acceptable path is lost.
- `BEAM_WIDTH`/`truncate` only matter when the number of simultaneously-live states
  exceeds the width. On Metasploitable and scan_results the live frontier is tiny
  (≪100), so the search is **exhaustive** there → identical accepted set.
- Beam truncation only bites on large graphs (the scalability case), where the
  requirement is explicitly "return only highest-value paths", not completeness.
- `MAX_DEPTH = MAX_HOPS = 12` keeps the explored simple-path space identical to
  today on the fixtures.

---

## 5. Heuristic function (`heuristics.py`)

`heuristic_score(state)` is the A* `f = g + h` priority value (higher = explore
first). All inputs are deterministic graph attributes — no ML, no randomness.

```
g_value (path so far) =
    mean(edge.confidence_contribution) / 100      # evidence strength
  * maturity_factor(verified vs candidate)         # verified≫partial≫candidate
  * privilege_progress(privilege_level)            # creds/priv-esc accumulated

h_value (forward estimate to a terminal) =
    max_reachable_criticality(current_node, g)     # best terminal still reachable
  * terminal_proximity(current_node, g)            # 1/(1+hops_to_nearest_terminal)

score = g_value * (1 + h_value)
```
Component sources (all already in the codebase):
- `exploitability/confidence` → edge `confidence_contribution`, node `confidence`
- `criticality` → `classify_criticality` weight
- `privilege_gain` → `privilege_level` transitions (credential/identity/admin)
- `blast_radius` → node `blast_radius` (already annotated)
- `terminal_proximity` → BFS distance to nearest terminal (precomputed once)

**Priority precedence (per spec):**
verified exploit > verified credential > verified privilege-escalation >
verified lateral movement > verified data access; with explicit penalties for
`candidate`, `partial`, `inventory`. Implemented as a discrete `tier_weight`
multiplier so the ordering is exact and explainable.

This makes "internet → CVE → credential → role → RDS" outrank
"internet → service → service → software → software".

---

## 6. Early pruning (`pruning.py`) — each rule proven sound

A branch is pruned only if **no** extension of it could pass `validate_full_path`.

| Rule | Prune when | Soundness (why no valid path is lost) |
|---|---|---|
| **Loop** | `nbr in state.visited` | `all_simple_paths` is simple-only; revisits never appear in current output |
| **Impossible transition** | adding `nbr`'s capability violates `transitions_are_valid` of the running capability list | Step B already rejects these at validation; transitions are monotonic so an invalid prefix can't become valid later |
| **Capability regression** | `chain_is_logical` fails on running caps | same as today's validation, prefix-monotonic |
| **Depth** | `state.depth+1 > MAX_DEPTH` | equals current `cutoff=MAX_HOPS` |
| **Dead-end (no terminal reachable)** | no terminal reachable from `nbr` (precomputed reachability) | such a branch can never end at a terminal → always rejected today |
| **Candidate-only continuation** | `nbr` is `cve_cand:`/`prereq:` AND no verified node reachable beyond | mirrors "path ends before verified applicability" rejection |

**Pruning is intentionally conservative.** Terminal-*type* validation, the
"validated finding required", confidence threshold, and final `is_terminal_target`
checks remain in `validate_full_path` (NOT moved into pruning), so the final
accept/reject decision is byte-identical to today. Pruning is a performance filter
that is a strict subset of existing rejections.

Terminal eligibility for *saving* a path uses the existing
`is_terminal_target(node_id, node_data)` (exploit outcome / high-criticality /
data / secret / admin / domain). Service/software/inventory/candidate/prereq nodes
are never saved as terminals — identical to today.

---

## 7. Determinism strategy

- **Neighbor order:** `sorted(g.successors(n))` (node_id ASC).
- **Entry order:** `sorted(entries)`.
- **Frontier key (total order, no ties):**
  ```
  key = (-round(heuristic_score, 9),
         -confidence,
         -round(risk, 6),
         -criticality_weight,
         current_node,            # node_id ASC
         path)                    # full tuple — guarantees a total order
  ```
  Encoded into a single tuple pushed to `heapq` (which is not stable, so the key
  must itself be a total order — the trailing `path` guarantees that).
- **No floats in equality-critical positions:** heuristic/risk are rounded to fixed
  precision before comparison.
- Result: identical output across runs (validated by `test_search_determinism.py`,
  100 runs).

---

## 8. Integration & feature flag (Step D5)

`discover_attack_paths` gains an internal switch (default = beam) with the old loop
kept as fallback:

```python
SEARCH_MODE = "beam"   # "beam" | "all_simple_paths"

raw_paths = find_attack_paths(g, entries, target_nodes, ctx, mode=SEARCH_MODE)
for path in raw_paths:
    accepted, hypothetical, reject, survive = validate_full_path(g, path, validated_ids)
    ...  # EXACT same body as today
```
- The `for entry/terminal/all_simple_paths` triple-loop is replaced by
  `find_attack_paths(...)` returning an ordered list of node-id paths.
- Everything after enumeration (validation, confidence, scoring, sort, dedupe,
  `_path_to_model`, all `path_proof.*` counters) is **unchanged**.
- Fallback mode reproduces today's behavior exactly for A/B verification.
- Orchestrator/CLI: optional `--search` flag may expose the mode later; default
  beam. (Can be deferred; not required for parity.)

### Proof mode additions (additive only)
- `path_proof` keeps all current fields. New optional fields:
  `search_mode`, `states_expanded`, `branches_pruned`, `prune_reason_counts`.
  These are additive; existing proof lines/counters are untouched so Metasploitable
  proof output is unchanged (beam explores the same tiny space, pruning count = 0
  there because nothing impossible is generated).

---

## 9. Parity strategy (how we guarantee "no change")

1. **Reuse** `validate_full_path`, `compute_path_confidence`, `score_path`,
   terminal logic, proof objects — zero edits to them.
2. **Identical post-processing** — same candidate tuple shape, same risk-DESC sort,
   same `seen` dedupe, same `MAX_PATHS` slice, same `_path_to_model`.
3. **Sound pruning** — subset of existing rejections; cannot drop a valid path.
4. **Exhaustive on small graphs** — frontier never hits `BEAM_WIDTH` on the
   fixtures, so the accepted set is provably the same as `all_simple_paths`.
5. **`MAX_DEPTH = MAX_HOPS = 12`** — same simple-path horizon on the fixtures.
6. **A/B test** — `test_search_determinism.py`/parity asserts beam-mode and
   `all_simple_paths`-mode produce the *same accepted path node-id sets* on
   Metasploitable and scan_results.

---

## 10. Step-by-step implementation (gated)

- **D1 — framework**: create `search/` package, `SearchState`, `priority.py`,
  `search_engine.py` with `mode="all_simple_paths"` fallback wired into
  `discover_attack_paths`. Behavior identical (still using all_simple_paths). Run
  full suite → expect 106 green, Metasploitable unchanged.
- **D2 — beam search**: implement `beam_search.py` (no pruning/heuristic yet:
  uniform priority → effectively BFS/DFS). Switch default to beam. Verify parity.
- **D3 — heuristics**: add `heuristics.py`, plug into frontier key. Verify parity
  (ordering of *exploration* changes, accepted set + final sort unchanged).
- **D4 — pruning**: add `pruning.py`, wire into expansion. Verify parity + that
  pruned counts are 0 on Metasploitable, >0 on a synthetic dense graph.
- **D5 — finalize**: proof fields, scalability tuning, docs.

Each step ends with: full `pytest`, Metasploitable parity check (4 paths /
{83,92,100,100} / {6.5,7.2,8.6,8.6} / proof unchanged).

---

## 11. Test plan (required files)

| File | Asserts |
|---|---|
| `tests/test_beam_search.py` | beam finds the same 4 Metasploitable paths; same scan_results paths; beam-vs-all_simple_paths accepted-set equality |
| `tests/test_search_pruning.py` | `internet→database`, `internet→domain admin`, `service→database` pruned/rejected; candidate-only & inventory branches not returned |
| `tests/test_search_heuristics.py` | CVE→credential→role→RDS ranks above service→service→software; verified > candidate ordering; tie-break order (conf, risk, criticality, node_id) |
| `tests/test_search_scalability.py` | synthetic 500-node / 5000-edge graph completes < 5s, deterministic, bounded results |
| `tests/test_search_determinism.py` | run search 100× → identical output (path ids, order, confidence, risk) |

Plus: full existing suite (106) must stay green; Metasploitable parity assertion in
`test_beam_search.py`.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Beam width drops a valid fixture path | frontier stays ≪ width on fixtures (verified) + A/B parity test + fallback flag |
| Float nondeterminism in heuristic ordering | round to fixed precision; full-tuple total-order key incl. `path` |
| `MAX_DEPTH` change alters scan_results paths | keep = 12; verify scan_results path set unchanged |
| Pruning too aggressive (loses valid path) | every rule proven a subset of existing rejections; pruned-branch proof log for audit |
| Proof output drift on Metasploitable | new proof fields additive; pruning count = 0 there; A/B proof comparison |
| Heap instability | total-order key (no equal keys possible due to `path` tiebreak) |

---

## 13. Success criteria (restated)
- all existing tests pass · Metasploitable output unchanged · beam search replaces
  `all_simple_paths` (fallback retained) · deterministic ordering · impossible paths
  pruned early · 500-node graph < 5s · proof preserved · path quality maintained/improved.

**No code will be written until this plan is approved.** On approval I will execute
D1→D5 sequentially, running the full suite + parity check after each step, and pause
for review at the end (or per-step if you prefer).
