# Phase H — Deterministic Attack Path Classification & MITRE Mapping

Phase H adds a **structural, deterministic** attack-category classifier and MITRE
ATT&CK mapping to every accepted path. No LLM, ML, probabilistic logic, fuzzy
matching, embeddings, or free-text keyword scoring.

## Architecture

```
vayne/models/
  attack_categories.py          AttackCategory enum
  __init__.py                   AttackPath + Phase H fields

vayne/attack_paths/classification/
  __init__.py                   public API
  classifier.py                 classify_attack_path(graph, path)
  signatures.py                 structural signature matchers (priority-ordered)
  mitre.py                      fixed category → tactic/technique tables
  proof.py                      AttackCategoryProof dataclass
```

**Integration point:** `discovery._path_to_model()` — after
`compute_path_confidence_with_proof()` and `score_path()`, before returning
`AttackPath`. Discovery, confidence, and risk logic are **unchanged**.

**Proof mode:** `PathDiscoveryProof.path_classifications` + new
`=== ATTACK CATEGORY CLASSIFICATION ===` section appended to `log_lines()`
(existing sections unchanged).

## Classification rules

Matchers run in **priority order**; first structural match wins:

| Priority | Category | Structural requirement |
|---:|---|---|
| 1 | `domain_compromise` | `domain_compromise` capability OR `domain` node + privilege escalation |
| 2 | `container_escape` | `container`/`pod`/`kubernetes` node + escalation/execution |
| 3 | `supply_chain` | `github_repo`/`ci_cd`/`pipeline`/`webhook` node |
| 4 | `cloud_attack` | cloud node types (`iam_role`, `rds`, `service_account`, …) + credential/IAM chain |
| 5 | `data_exfiltration` | `data_access` capability + database/storage node types |
| 6 | `identity_attack` | identity/iam nodes + escalation (excluding domain takeover) |
| 7 | `credential_attack` | `credential_access` + credential/secret node types or credential edges |
| 8 | `lateral_movement` | `lateral_movement` capability, lateral edge relationship, or ≥2 distinct hosts |
| 9 | `privilege_escalation` | `privilege_escalation` + identity/admin node types |
| 10 | `remote_rce` | `initial_access` → `execution`/`code_execution` + verified exploit + `access_outcome` edge |
| — | `unknown` | no signature matched |

### REMOTE_RCE (Metasploitable)

Requires all of:
- `initial_access` capability on path
- `execution` or `code_execution` capability
- verified exploit structure (`applicability_status=verified`, `cve_verified:` / `access:` node id)
- `access_outcome` edge (`artifact_type=access_outcome` or `relationship=yields_access`)

## MITRE mappings

Fixed lookup tables in `mitre.py` — no inference.

| Category | Tactics | Example techniques |
|---|---|---|
| `remote_rce` | TA0001, TA0002 | T1190, T1059 |
| `credential_attack` | TA0006 | T1552, T1078 |
| `privilege_escalation` | TA0004 | T1068, T1548 |
| `lateral_movement` | TA0008 | T1021, T1550 |
| `data_exfiltration` | TA0010 | T1005, T1530 |
| `domain_compromise` | TA0004, TA0008, TA0006 | T1078.002, T1484 |
| `cloud_attack` | TA0003, TA0004, TA0008 | T1078.004, T1098, T1552.005 |
| `identity_attack` | TA0004, TA0006 | T1078, T1098 |
| `container_escape` | TA0004, TA0002 | T1611, T1610 |
| `supply_chain` | TA0001, TA0003 | T1195, T1608 |

Stored on each path: `mitre_tactics`, `mitre_techniques`.

## Proof structure

Every classification emits `AttackCategoryProof`:

```json
{
  "category": "remote_rce",
  "matched_rules": ["verified_rce_chain"],
  "matched_nodes": ["VERIFIED CVE-2007-2447", "remote shell access via Samba"],
  "matched_capabilities": ["initial_access", "code_execution"],
  "matched_edges": ["yields_access"],
  "confidence": 100,
  "explanation": [
    "verified exploit on path",
    "access_outcome edge (remote execution)",
    "initial_access → execution capability chain"
  ]
}
```

On `AttackPath`: `attack_category`, `attack_category_proof`.

## Parity evidence

Metasploitable after Phase H:

```
paths      = 4
confidence = [83, 92, 100, 100]
risk       = [6.5, 7.2, 8.6, 8.6]
category   = remote_rce (all 4 paths)
```

Classification runs **after** scoring; it does not alter path selection, confidence,
or risk. Verified by `test_metasploitable_parity_unchanged` and
`test_category_determinism.py` (100-run byte-identical signature).

## Test coverage

| File | What it verifies |
|---|---|
| `test_attack_categories.py` | Metasploitable REMOTE_RCE, synthetic cloud/credential/domain/lateral/data chains, proof completeness |
| `test_mitre_mapping.py` | Tactic/technique tables, Metasploitable MITRE fields |
| `test_category_determinism.py` | 100-run determinism + parity |

Full suite: **184 passed**.

## Limitations

- Categories depend on **typed graph facts** present in scan/enrichment output;
  paths without cloud/identity/credential nodes classify as `remote_rce` or
  `unknown`.
- MITRE technique lists are a **fixed deterministic subset**, not exhaustive
  ATT&CK coverage.
- `models.py` was converted to the `vayne/models/` package (same import path
  `from vayne.models import …` preserved via `__init__.py`).

## Future work

- Render attack category + MITRE in HTML/Markdown reports and CLI summary.
- Extend signatures when new node types appear in production scan pipelines.
- Optional technique selection based on matched edge `relationship` (still
  deterministic lookup, not scoring).
