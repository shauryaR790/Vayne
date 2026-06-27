# Phase E — Confidence Engine Refactor + Confidence Proof System

**Status:** COMPLETE. 139 tests pass. Metasploitable parity preserved exactly
(`paths=4`, confidence `{83,92,100,100}`, risk `{6.5,7.2,8.6,8.6}`). Proof mode
unchanged. Confidence is now fully evidence-derived and auditable.

See also `docs/confidence_audit.md` (Step 1 audit).

---

## 1. Decisions that shaped the implementation

The audit surfaced two direct contradictions between Step 6 (calibration bands)
and Step 7 (parity). Per your decisions:

1. **Parity wins.** Where a calibration band conflicts with `{83,92,100,100}`,
   parity is authoritative; bands are documented guidance. (vsftpd/samba verified
   weaponized exploits legitimately reach **100**, above the 85–99 guidance.)
2. **Inventory edge strength is kept for path math.** The 10–40 "inventory" band
   applies to inventory-only findings/paths, not to infra edges *inside* a
   verified path (those feed `infra_mean` and must stay to hold parity).
3. **Additive + calibrated.** Every former hidden boost/floor is re-expressed as a
   **named, documented, proof-emitted factor** with identical arithmetic — so
   nothing is hidden and parity is exact.

> **Key principle:** "remove hardcoded boosts" is implemented as *de-magicking* —
> anonymous inline `max(conf, 92)` / `*1.06` become named constants
> (`VERIFIED_MATURITY_FLOOR`, `VERSION_PORT_CORROBORATION_FACTOR`, …) surfaced as
> `ConfidenceFactor`s in a `ConfidenceProof`. No value is applied that does not
> appear, by name and with evidence, in the proof.

---

## 2. The ConfidenceProof system (Steps 2, 4, 5)

`vayne/attack_paths/confidence_proof.py`:

```python
@dataclass(frozen=True)
class ConfidenceFactor:
    name: str
    weight: float
    evidence: list[str]
    contribution: float

@dataclass
class ConfidenceProof:
    formula: str
    factors: list[ConfidenceFactor]
    raw_score: float
    normalized_score: int
    explanation: list[str]
```

> Location note: the spec asked for `vayne/models/confidence_proof.py`, but
> `vayne/models.py` is a module (not a package); converting it would touch every
> `from vayne.models import …` and risks a circular import when a Pydantic model
> imports the dataclass. The object lives next to the confidence engine and is
> stored on Pydantic models as a serialized dict (`AttackPath.confidence_proof`,
> `AttackPathEdge.confidence_proof`, `ProofEdge.confidence_proof`).

- **Every edge** emits a proof — `graph_builder._add_edge` attaches the rich
  exploit proof when available, else synthesizes one (`_edge_confidence_proof`).
- **Every path** emits a proof — `compute_path_confidence_with_proof` →
  `AttackPath.confidence_proof`.

---

## 3. Removed / re-expressed hardcodes (Step 3)

| Where | Was (hidden) | Now (named factor / constant) |
|---|---|---|
| `exploit_intelligence.compute_exploit_confidence` | `max(conf,92/88/82/72)` floors | `VERIFIED_MATURITY_FLOOR` (proof factor `maturity_floor`) |
| same | `min(98/96/94/88)` caps | `VERIFIED_MATURITY_CAP` (factor `maturity_cap`) |
| same | `boost *= 1.06`, `*= 1.03` | `VERSION_PORT_CORROBORATION_FACTOR`, `ANON_FTP_ENVIRONMENT_FACTOR` (factor `credibility_boost`) |
| same | `if conf<50: conf=50` | `VERIFIED_MIN_CONFIDENCE` |
| `confidence_model.compute_path_confidence_multiplicative` | `0.22/0.78` weights | `PATH_INFRA_WEIGHT`, `PATH_EXPLOIT_WEIGHT` |
| same | `1.08/1.04/1.12` verified boosts | `VERIFIED_BOOST_*` (factor `verified_exploit`) |
| same | `min(99,max(50,…))`, `0.78`, `0.92` | `VERIFIED_PATH_CEILING/FLOOR`, `UNVERIFIED_PATH_FACTOR`, `NON_TIER1_TIER_FACTOR` |
| `path_reasoning.compute_path_confidence` | `confidence + 2` multi-tool | `MULTI_TOOL_CORROBORATION_POINTS` (factor `corroboration`) |
| `graph_builder._add_edge` | inline `84/76/72` | `INVENTORY_EDGE_CONFIDENCE` |
| `path_reasoning` | `MAX_CONFIDENCE_ALL_TIER1` (dead) | **deleted** |

All numeric values are unchanged → parity preserved. The arithmetic is identical;
only its *visibility* changed.

---

## 4. Edge confidence proof (Step 4) — real example (vsftpd verified edge)

```json
{
  "formula": "verified_exploit_confidence = clamp(min(maturity_cap, max(base_multiplicative, maturity_floor) × credibility_boost), low=verified_min)",
  "factors": [
    {"name": "base_multiplicative_model", "weight": 0.76, "contribution": 76.0,
     "evidence": ["scanner_reliability=0.95 (exploit_intel)", "corroboration=0.88", "exploit_maturity=1.00", "applicability=0.97", "environmental=0.94"]},
    {"name": "maturity_floor", "weight": 92.0, "contribution": 92.0,
     "evidence": ["tier=weaponized_exact", "maturity=weaponized", "verification_mode=exact_version"]},
    {"name": "credibility_boost", "weight": 1.2556, "contribution": 115.51,
     "evidence": ["per-exploit credibility modifier (exact_version)", "version + port both confirmed", "anonymous FTP access observed"]},
    {"name": "maturity_cap", "weight": 98.0, "contribution": 98.0, "evidence": ["tier=weaponized_exact ceiling"]}
  ],
  "raw_score": 115.51,
  "normalized_score": 98
}
```

## 5. Path confidence proof (Step 5) — real example (vsftpd path)

```json
{
  "formula": "path_confidence = round(100 × (w_infra × infra_mean + w_exploit × exploit_mean) × verified_boost × tier_factor)",
  "factors": [
    {"name": "infra_confidence", "weight": 0.7733, "contribution": 77.3, "evidence": ["3 infrastructure edges"]},
    {"name": "exploit_confidence", "weight": 0.98, "contribution": 98.0, "evidence": ["4 exploit-chain edges"]},
    {"name": "verified_exploit", "weight": 1.12, "contribution": 104.7, "evidence": ["weaponized", "exact_version"]},
    {"name": "tier_factor", "weight": 1.0, "contribution": 104.7, "evidence": ["mixed-tier"]},
    {"name": "corroboration", "weight": 2.0, "contribution": 1.0, "evidence": ["≥2 independent tools corroborate this path"]}
  ],
  "raw_score": 104.67,
  "normalized_score": 100
}
```

---

## 6. Calibration ranges (Step 6) — guidance + where Metasploitable lands

| Class | Step 6 band | Implementation |
|---|---|---|
| Inventory (standalone) | 10–40 | `observation_confidence` for OBSERVED findings (70–85, see note) |
| Candidate CVE | 20–55 | candidate cap `min(55)` in `compute_confidence` |
| Partial exploit | 40–70 | intel `partial` 62–72 / candidate path factor |
| Verified exploit | 70–95 | proftpd **83**, tomcat **92** ✓ |
| Verified weaponized | 85–99 (guidance) | vsftpd **100**, samba **100** (parity > guidance) |
| Verified credential chain | 75–95 | intel `verified` 84–96 |
| Verified cloud escalation | 75–95 | intel `verified` 84–96 |
| Verified domain compromise | 85–99 | intel `verified` (high corroboration) |

**Note / discovered limitation:** the *inventory* 10–40 band could not be applied
to infra edges without breaking parity (they contribute 22% of every verified
path). Standalone inventory **findings** stay at the existing 70–85 observation
band; reconciling the 10–40 target with path math is deferred (would require
separating "edge strength for path math" from "displayed inventory confidence").

---

## 7. Parity verification (Step 7)

`scripts/phase_d_parity_check.py` after every module change:
```
[metasploitable] paths=4 confidence=[83, 92, 100, 100] risk=[6.5, 7.2, 8.6, 8.6]
expected paths=4:True conf{83,92,100,100}:True risk{6.5,7.2,8.6,8.6}:True
[determinism] 100 runs identical
PHASE D PARITY: PASS
```
Risk (`score_path`) was intentionally **not** touched in Phase E (confidence
scope), so risk parity is trivially preserved.

---

## 8. Tests (Step 8) — 11 new, 139 total

- `tests/test_confidence_proof.py` — every path & edge emits a complete
  ConfidenceProof; normalized_score matches the value; verified-exploit edge proof
  names floor/cap/boost; no unnamed (hidden) factor.
- `tests/test_confidence_determinism.py` — confidence + full proof identical over
  100 runs; Metasploitable confidence set stable.
- `tests/test_confidence_calibration.py` — added band checks (verified weaponized
  85–100, verified 70–95, none below 50) + dead-constant removal.

---

## 9. Limitations discovered

1. **Inventory band conflict (§6 note).** 10–40 vs path-math needs (70–85) — not
   reconciled; parity prioritized.
2. **`100` exceeds the 85–99 weaponized band.** Kept for parity; documented as the
   verified-weaponized + multi-tool corroboration ceiling.
3. **De-magicking, not deletion.** True zero-constant scoring is impossible (every
   formula has weights). Constants are now *named, documented, and proof-emitted*
   rather than anonymous inline overrides — which is the auditable, parity-safe
   interpretation of the goal.
4. Risk floors (`scoring.py`) remain (out of Phase E scope) and are noted in the
   audit for a future risk-engine phase.
