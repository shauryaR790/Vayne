# Phase E — Step 1: Confidence Audit

**Status:** AUDIT ONLY. No code modified (per Step 1 instruction).
**Scope:** every place where a confidence value is floored, capped, boosted, or
set to a magic number.

> **CRITICAL UP-FRONT FINDING (read before Step 3):**
> The exact Metasploitable confidence values `{83, 92, 100, 100}` are *produced
> by* the hardcoded floors/boosts/caps this phase wants to remove (chiefly
> `compute_exploit_confidence` maturity floors + `compute_path_confidence_multiplicative`
> verified-boosts + the per-CVE `confidence_modifier` + the `+2` multi-tool bump).
> Therefore these items cannot be **deleted**; they must be **re-expressed** as
> calibrated evidence factors that reproduce the same numbers. A naive "remove the
> boosts" will break parity (Step 7 → STOP). The audit marks such items
> **"RE-EXPRESS (parity-critical)"** rather than "safe to remove".

Legend for **SAFE TO REMOVE?**:
- **DELETE** — redundant/benign clamp; removal cannot change parity.
- **RE-EXPRESS (parity-critical)** — drives Metasploitable output; must be folded
  into the evidence-factor formula and calibrated to reproduce `{83,92,100,100}`.
- **KEEP-AS-FACTOR** — already a documented evidence weight (not an ad-hoc
  override); keep but surface in `ConfidenceProof`.

---

## A. `vayne/attack_paths/confidence_model.py`

### A1 — `compute_confidence` maturity floor
- **FUNCTION:** `compute_confidence`
- **CURRENT LOGIC:** `if prerequisites_met and not version_match_only: maturity = max(maturity, 0.88)`
- **WHY IT EXISTS:** ensure prereq-verified exploits aren't dragged down by a low PoC maturity score.
- **DERIVABLE FROM EVIDENCE?** Yes — "prerequisites met" *is* evidence; can be an explicit `prerequisite_evidence` factor instead of a `max()` on maturity.
- **SAFE TO REMOVE?** RE-EXPRESS (parity-critical) — affects tomcat (functional+prereq).

### A2 — candidate cap
- **CURRENT LOGIC:** `if candidate_only or version_match_only: confidence = min(55, confidence)`
- **WHY:** keep candidate/inventory-only claims in the 20–55 band.
- **DERIVABLE?** Yes — this is the calibration ceiling for the "candidate" tier; becomes the documented candidate-tier cap factor.
- **SAFE TO REMOVE?** KEEP-AS-FACTOR (matches Step 6 candidate range 20–55).

### A3 — final clamp `min(100, confidence)`
- **SAFE TO REMOVE?** KEEP-AS-FACTOR (normalization, never changes a valid value).

### A4 — factor tables (`SCANNER_RELIABILITY`, `MATURITY_SCORES`), `corroboration_factor`, `exploit_maturity_factor` (`+0.05` public PoC), `applicability_factor` (0.97/0.42/0.90/0.62), `environmental_factor` (0.45 base + additive)
- **WHY:** the documented multiplicative evidence model.
- **DERIVABLE?** These *are* the evidence factors; constants are weights, not ad-hoc overrides.
- **SAFE TO REMOVE?** KEEP-AS-FACTOR (surface each in `ConfidenceProof.factors`).

### A5 — `compute_observation_confidence` (inventory)
- **CURRENT LOGIC:** `base = 68; += 4/5/6/7/4/3 per check; confidence = min(85, base)`.
- **WHY:** confirmed scan observations (inventory) → 70–85 band.
- **DERIVABLE?** Yes — additive evidence model; calibrate to Step 6 inventory band (10–40) **only if** it does not feed accepted Metasploitable paths (it feeds OBSERVED findings, not the 4 exploit paths). NOTE: Step 6 says inventory 10–40, but current observation confidence is 70–85; this is a **calibration conflict to resolve** (see §G).
- **SAFE TO REMOVE?** RE-EXPRESS (calibration conflict).

### A6 — `compute_path_confidence_multiplicative` (the big one)
- **CURRENT LOGIC (verified branch):**
  `weighted = 0.22*infra_mean + 0.78*exploit_mean`;
  `verified_boost = 1.08 if weaponized else 1.04`;
  `if exact_version and weaponized: verified_boost = 1.12`;
  `confidence = min(99, max(50, round(weighted*verified_boost*100)))`.
  **(non-verified branch):** `verified_boost = 0.78`; `tier_cap = 0.92 if not all_tier1`; `min(90|100)`.
- **WHY:** lift verified weaponized exploit paths into the 85–99 analyst band.
- **DERIVABLE?** Partly. `infra_mean`/`exploit_mean` are evidence; the `1.08/1.04/1.12` boosts and the `max(50)`/`min(99)` clamps are tuning constants that *set the Metasploitable path numbers*.
- **SAFE TO REMOVE?** RE-EXPRESS (parity-critical) — directly yields 100/100/92/83.

---

## B. `vayne/attack_paths/exploit_intelligence.py`

### B1 — per-CVE `confidence_modifier`
- **CURRENT LOGIC:** `ExploitRecord.confidence_modifier` = 1.15 (vsftpd), 1.10 (unrealircd), 1.05 (samba), 1.0 default; applied as `boost = record.confidence_modifier`.
- **WHY:** hand-tuned per-exploit credibility nudges.
- **DERIVABLE?** Partially — vsftpd/unrealircd are *trojanized exact-version backdoors* (that property is evidence: `verification_mode == "exact_version"`). The numeric 1.15/1.10/1.05 are magic.
- **SAFE TO REMOVE?** RE-EXPRESS (parity-critical) — fold into an evidence factor keyed on `verification_mode`/maturity, calibrated to parity.

### B2 — context boosts
- **CURRENT LOGIC:** `if version_match and port_match: boost *= 1.06`; `if "anonymous ftp" in evidence: boost *= 1.03`.
- **DERIVABLE?** Yes — version+port match and anonymous-FTP are observed evidence → explicit `version_precision` / `environment` factors.
- **SAFE TO REMOVE?** RE-EXPRESS (parity-critical).

### B3 — maturity floors + caps (THE primary hardcode)
- **CURRENT LOGIC:**
  - weaponized+exact: `conf = max(conf, 92); conf = int(min(98, conf*boost))`
  - weaponized: `max(conf, 88); min(96)`
  - functional: `max(conf, 82); min(94)`
  - else: `max(conf, 72); min(88)`
  - tail: `if conf < 50: conf = 50`
- **WHY:** force verified exploits into analyst-expected bands by maturity.
- **DERIVABLE?** The *maturity tier* is evidence; the floor/cap numbers are pure calibration constants.
- **SAFE TO REMOVE?** RE-EXPRESS (parity-critical) — these set the verified edge confidences feeding the path means.

---

## C. `vayne/attack_paths/path_reasoning.py`

### C1 — multi-tool bump
- **CURRENT LOGIC:** `if multi_tool: confidence = min(100, confidence + 2)`
- **WHY:** corroboration across ≥2 tools.
- **DERIVABLE?** Yes — corroboration is evidence; becomes a `corroboration` path factor.
- **SAFE TO REMOVE?** RE-EXPRESS (parity-critical) — the `+2` is what turns 99→100 on Metasploitable.

### C2 — `MAX_CONFIDENCE_ALL_TIER1 = 90`
- **CURRENT LOGIC:** module constant; **not referenced** in current code.
- **SAFE TO REMOVE?** DELETE (dead constant).

---

## D. `vayne/attack_paths/graph_builder.py`

### D1 — inventory edge tiers
- **CURRENT LOGIC:** `conf = 84 (service_fingerprint) | 76 (open_port) | 72 (other)`.
- **WHY:** tiered inventory edge strength.
- **DERIVABLE?** Yes — map to `compute_observation_confidence` evidence factors.
- **SAFE TO REMOVE?** RE-EXPRESS (parity-critical) — these are the `infra_mean` inputs for every Metasploitable path.

### D2 — prerequisite edge floor
- **CURRENT LOGIC:** `pre_conf = max(35, result.confidence - 10) if pre_status != "verified" else result.confidence`
- **SAFE TO REMOVE?** RE-EXPRESS (parity-critical for tomcat prereq edge).

### D3 — verified-CVE edge floor
- **CURRENT LOGIC:** `ver_conf = max(MIN_EDGE_CONFIDENCE, result.confidence)`; and in `_add_edge`: `conf = max(conf, MIN_EDGE_CONFIDENCE)` for `cve_verified/cve_enrichment` from `cve_catalog`.
- **SAFE TO REMOVE?** RE-EXPRESS (parity-critical).

### D4 — candidate edge threshold
- **CURRENT LOGIC:** `min_conf = 35 if is_cve_candidate else MIN_EDGE_CONFIDENCE` (acceptance gate, not a confidence override).
- **SAFE TO REMOVE?** KEEP-AS-FACTOR (acceptance threshold; document, don't change).

---

## E. `vayne/attack_paths/intel/_common.py`

### E1 — `intel_confidence` status base/cap
- **CURRENT LOGIC:** `_STATUS_BASE = {verified:84, partial:62, candidate:45}`; `_STATUS_CAP = {96,72,55}`; `bonus = min(count,3)*3`; `conf = min(cap, base+bonus)`.
- **WHY:** deterministic intel-domain confidence from status + corroboration count.
- **DERIVABLE?** Yes — already status+evidence-count based; align constants to Step 6 bands (verified credential/cloud 75–95, domain 85–99).
- **SAFE TO REMOVE?** KEEP-AS-FACTOR (already evidence-derived; surface as `ConfidenceProof`). Inert on Metasploitable → no parity impact.

---

## F. `vayne/attack_paths/formulas.py`

### F1 — `edge_confidence_contribution`
- **CURRENT LOGIC:** `(passed/10)*50 + min(25, source_count*8) + min(25, val_conf*0.25)`; `min(100, max(1, …))`.
- **WHY:** validation-check-based edge confidence (the non-inventory, non-override edges).
- **DERIVABLE?** Yes — this *is* an evidence model (checks + source count + validation confidence).
- **SAFE TO REMOVE?** KEEP-AS-FACTOR (document the weights; emit proof).

### F2 — `MIN_PATH_CONFIDENCE = 50`, `MIN_EDGE_CONFIDENCE = 50`
- **SAFE TO REMOVE?** KEEP-AS-FACTOR (acceptance thresholds, not overrides).

---

## G. Adjacent (risk) — out of strict scope but affects Step 7 parity

`vayne/attack_paths/scoring.py` contains analogous hardcodes that set the **risk**
parity `{6.5,7.2,8.6,8.6}`: `cvss_base = max(cvss_base, 8.5)`, `risk = max(risk, 8.5)`
(weaponized) / `max(risk, 7.0)` (functional), plus factor constants. Phase E is
"confidence", so risk floors are **not** being removed here, but they are noted
because Step 7 requires risk parity to also hold (it will, since `score_path` is
untouched).

`vayne/validator/engine.py` thresholds (45/25/50/80) are **classification gates**,
not confidence overrides — left untouched.

---

## H. Calibration conflicts discovered (must resolve before Step 6)

1. **Inventory band:** Step 6 says inventory `10–40`, but `compute_observation_confidence`
   currently yields `70–85` and inventory **edges** are `72–84`. Dropping inventory
   to 10–40 would crater `infra_mean` and **break path-confidence parity**
   (infra is 22% of every verified path). → Recommend: keep inventory *edge*
   strength as-is for path math; apply the 10–40 band only to standalone inventory
   *findings* that never form accepted exploit paths, OR treat Step 6 inventory band
   as applying to "inventory-only paths" not "infra edges within a verified path".
   **This needs your decision.**

2. **Verified exploit band 70–95 vs current 100/100:** Metasploitable vsftpd/samba
   currently report `100`. Step 6 verified-weaponized band is `85–99`. `100` exceeds
   it. Reproducing parity (`100`) **conflicts** with the 85–99 ceiling.
   → Either parity wins (keep 100, band documented as "100 = verified weaponized +
   multi-tool corroboration") or the band wins (recalibrate vsftpd/samba to ≤99,
   **breaking the `{83,92,100,100}` parity requirement**).
   **This is a direct Step 6 ↔ Step 7 contradiction and needs your decision.**

---

## I. Summary table

| ID | File | Item | Verdict |
|----|------|------|---------|
| A1 | confidence_model | maturity `max(,0.88)` | RE-EXPRESS |
| A2 | confidence_model | candidate `min(55)` | KEEP-AS-FACTOR |
| A5 | confidence_model | observation 68+…min(85) | RE-EXPRESS (conflict) |
| A6 | confidence_model | path boosts 1.08/1.04/1.12, min(99)/max(50) | RE-EXPRESS (parity-critical) |
| B1 | exploit_intelligence | per-CVE `confidence_modifier` | RE-EXPRESS (parity-critical) |
| B2 | exploit_intelligence | `*1.06`, `*1.03` boosts | RE-EXPRESS (parity-critical) |
| B3 | exploit_intelligence | maturity floors/caps + `<50→50` | RE-EXPRESS (parity-critical) |
| C1 | path_reasoning | `+2` multi-tool | RE-EXPRESS (parity-critical) |
| C2 | path_reasoning | `MAX_CONFIDENCE_ALL_TIER1` dead | DELETE |
| D1 | graph_builder | inventory 84/76/72 | RE-EXPRESS (parity-critical) |
| D2 | graph_builder | prereq `max(35,…-10)` | RE-EXPRESS |
| D3 | graph_builder | verified `max(MIN_EDGE,…)` | RE-EXPRESS |
| E1 | intel/_common | status base/cap | KEEP-AS-FACTOR |
| F1 | formulas | edge_confidence_contribution | KEEP-AS-FACTOR |

---

## J. Recommended approach for Steps 2–6 (pending your approval)

1. Introduce `ConfidenceProof`/`ConfidenceFactor` (Step 2) and thread them through
   edge + path confidence so **every** value is explained by named factors.
2. Replace each **RE-EXPRESS** override with an explicit, documented evidence
   factor (scanner reliability, corroboration, maturity, version precision,
   prerequisite evidence, environment, reachability, reproducibility, privilege,
   lateral, terminal). No post-hoc `max()/min()` on the final score except the
   single normalization clamp `0–100`.
3. **Calibrate the new factor weights to reproduce `{83,92,100,100}` / `{6.5,7.2,8.6,8.6}` exactly.**
   This is the safest interpretation of "remove hardcoded boosts": the boosts
   become *derived* factors, not magic floors, while parity holds.
4. Resolve the two §H conflicts per your decision before touching Step 6 bands.

**Per Step 1, nothing has been changed.** I need two decisions (the §H conflicts)
before implementing Steps 2–6.
