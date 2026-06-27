# Phase F+G — Unified Risk Engine + Proof System (Completion Report)

Phase F (Risk Engine Expansion) and Phase G (Proof Mode Upgrade) were
implemented as **one additive, test-gated, parity-preserving** change. Every new
score, boost, penalty, and decision is surfaced as a **named proof factor** — no
anonymous constants. Every acceptance and rejection is now explainable.

## What changed

VAYNE output evolved from `confidence + risk + accepted/rejected` to:

| Output | Where it lives |
|---|---|
| confidence score + **confidence proof** | `AttackPath.confidence` / `confidence_proof` (Phase E) |
| risk score + **risk proof** | `AttackPath.risk_score` / `risk_proof` |
| **acceptance proof** | `AttackPath.accepted_proof` |
| **rejection proof** | `PathDiscoveryProof.rejected_path_proofs[]` |
| **attacker effort proof** | `AttackPath.effort_proof` |
| **blast radius proof** | `AttackPath.blast_proof` |
| **missing evidence + revival proof** | `AttackPath.revival_options`, `RejectedPathProof.revive_with` |
| **alternative paths** | `AttackPath.alternatives` |

## New / changed files

- `vayne/attack_paths/risk_proof.py` — `RiskFactor`, `RiskProof` dataclasses.
- `vayne/attack_paths/scoring.py` — `score_path()` now emits a `RiskProof` and
  adds 5 evidence-gated dimensions (see `risk_calibration.md`).
- `vayne/attack_paths/proof/` — package (was `proof.py`):
  - `graph.py` — original graph/path proof models (re-exported, unchanged output).
  - `acceptance.py` — `AcceptedPathProof` + `build_accepted_proof`.
  - `rejection.py` — `RejectedPathProof` + `build_rejected_proof`.
  - `revival.py` — `suggest_revival()` revival engine.
  - `alternatives.py` — `AlternativePath`.
- `vayne/models.py` — `AttackPath` gains `risk_proof`, `accepted_proof`,
  `rejected_proof`, `effort_proof`, `blast_proof`, `alternatives`,
  `revival_options` (all default-empty → output is a strict superset).
- `vayne/attack_paths/discovery.py` — assembles all proofs; rejected paths now
  produce structured proofs + revival; accepted paths attach alternatives.

## Determinism

`tests/test_phase_fg_determinism.py` asserts the full JSON signature of paths,
risk proofs, acceptance proofs, rejection proofs, alternatives and revival is
**byte-identical across 100 runs**. Ordering is total: alternatives sort by
would-be confidence desc then label; revival is keyword-routed and deduplicated
in first-match order.

## Parity evidence

Metasploitable is unchanged:

```
paths      = 4
confidence = [83, 92, 100, 100]
risk       = [6.5, 7.2, 8.6, 8.6]
blast(top) = 47 assets
```

The 5 new risk dimensions are **1.0 (neutral)** on every Metasploitable path
(no high-value asset / sensitive data / identity / lateral / persistence
evidence present), so the risk product — and therefore the risk values — are
preserved exactly. Verified by `test_new_dimensions_neutral_on_metasploitable`.

## Tests added (29)

`test_risk_proof.py`, `test_acceptance_proof.py`, `test_rejection_proof.py`,
`test_revival_engine.py`, `test_alternative_paths.py`,
`test_risk_calibration.py`, `test_phase_fg_determinism.py`.
Full suite: **168 passed**.

## Discovered limitations

- Metasploitable produces no rejected paths (the beam search returns exactly the
  4 valid paths), so rejection/alternative/revival proofs are exercised on
  synthetic graphs and via the direct builders. Richer cloud/AD datasets will
  populate them end-to-end.
- New risk-dimension weights are analyst-calibrated constants (documented in
  `risk_calibration.md`); they are conservative and only *raise* risk when their
  evidence is present.

## Future work

- Source business-criticality weights from an asset inventory / tagging file.
- Emit `rejected_proof` per accepted path when a strictly-better variant exists.
- Render the new proofs in the HTML/Markdown report and CLI proof mode.
