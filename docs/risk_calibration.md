# Risk Calibration (Phase F)

VAYNE risk is a **multiplicative, evidence-derived** score, fully reconstructable
from its `RiskProof`. No anonymous constants — every multiplier is a named
`RiskFactor` carrying its evidence and running contribution.

## Formula

```
risk = min(10, cvss_base
              × maturity_factor
              × access_factor
              × auth_factor
              × evidence_factor
              × blast_factor
              × privilege_factor
              × business_criticality   ← Phase F
              × data_sensitivity       ← Phase F
              × identity_impact        ← Phase F
              × lateral_movement       ← Phase F
              × persistence)           ← Phase F
```

A verified, unauthenticated RCE applies a floor (8.5 weaponized / 7.0
functional); when applied it is recorded as the `verified_rce_floor` factor.

## Existing factors (unchanged — preserve parity)

| Factor | Source |
|---|---|
| `cvss_base` | max CVSS on path / 10 (≥8.5 for verified RCE) |
| `exploit_maturity` | weaponized 1.0 / functional 0.92 / poc 0.78 / theoretical 0.55 / unknown 0.65 |
| `access_vector` | remote 1.05 / local 0.85 |
| `authentication` | none 1.0 / required 0.88 (0.92 with public PoC) |
| `evidence_strength` | 0.72 + path_confidence × 0.28 |
| `blast_radius` | 1.0 + (blast − 1) × 0.004, capped 1.15 |
| `privilege_gain` | identity/credential criticality on path |

## New Phase F dimensions (neutral = 1.0 when evidence absent)

Each factor takes the **max weight** of any matching node on the path; absent
evidence ⇒ 1.0, so Metasploitable (pure RCE) is unaffected.

### business_criticality
| node_type | weight |
|---|---|
| domain | 1.50 |
| admin | 1.40 |
| kubernetes | 1.35 |
| rds | 1.30 |
| iam_role | 1.30 |
| database / bucket / secret | 1.25 |
| redis / storage | 1.20 |

### data_sensitivity
| node_type | weight |
|---|---|
| secret | 1.25 |
| rds | 1.25 |
| credential / api_key / ssh_key / data / database / bucket | 1.20 |
| jwt | 1.15 |
| session | 1.10 |

### identity_impact
| node_type | weight |
|---|---|
| domain | 1.50 |
| admin | 1.40 |
| iam_role | 1.30 |
| service_account / identity | 1.25 |
| role | 1.20 |

### lateral_movement
`1.40` when the path contains a `lateral_movement` capability node or evidence
markers (`credential reuse`, `ssh pivot`, `assume role`, `trust relationship`,
`lateral movement`); otherwise `1.0`.

### persistence
| node_type | weight |
|---|---|
| domain | 1.25 |
| iam_role | 1.20 |
| service_account | 1.15 |

Plus `1.15` when evidence markers (`cron`, `scheduled task`, `systemd`,
`autostart`, `persistence`) are present.

## Reconstruction guarantee

`test_risk_calibration.py::test_risk_proof_reconstructs_raw_score` asserts that
the product of all factor weights (excluding the explicit floor) equals the
proof's `raw_score` — proving there are no hidden constants in the risk path.

## Parity

Metasploitable risk set remains exactly `{6.5, 7.2, 8.6, 8.6}`; all five new
factors are `1.0` on those paths.
