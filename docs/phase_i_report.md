# Phase I — Production Export Layer (Completion Report)

Phase I adds the **final production layer**: first-class export artifacts,
deterministic attack stories, executive/analyst reports, remediation plans,
attack surface scoring, and frontend-ready graph visualization — all without
changing attack discovery, confidence, risk, or proof mode behavior.

## Architecture

```
vayne/production/
  __init__.py
  attack_story.py       # template-driven attack narratives
  attack_surface.py     # environment score 0–100
  remediation_plan.py   # rule-table remediation items
  executive_report.py   # executive_report.md
  analyst_report.py     # analyst_report.md
  graph_export.py       # graph.json + attack_paths.json
  proof_export.py       # proof.txt
  exporter.py           # orchestrates all exports

vayne/orchestrator/pipeline.py
  → export_production_artifacts() after discovery (additive)
  → enrich_report() attaches attack_story + surface score
```

**Integration:** Production enrichment runs **after** path discovery and scoring.
It does not modify which paths are accepted, their confidence, risk, or ordering.

## Export artifacts

Each investigation writes to the report directory:

| File | Contents |
|---|---|
| `investigation.json` | Full enriched report (legacy + Phase I fields) |
| `investigation.html` / `investigation.md` | Legacy templates (unchanged) |
| `attack_paths.json` | Paths with proofs, MITRE, attack stories |
| `graph.json` | Nodes, edges, visualization hints, path summary |
| `findings.json` | Validated + rejected findings with reasoning |
| `executive_report.md` | Executive summary sections |
| `analyst_report.md` | Analyst-grade proof/evidence sections |
| `attack_story.md` | Per-path deterministic narratives |
| `remediation_plan.md` / `.json` | Rule-based remediation items |
| `proof.txt` | Graph proof log + path proofs + surface score |

## Attack stories

Template-driven from structured path fields only:

```text
An external attacker can exploit vsftpd/vsftpd:2.3.4 (CVE-2011-2523)
exposed via service/tcp/21@192.168.56.101 to obtain remote shell access
on host 192.168.56.101.
```

Each path includes: `initial_foothold`, `exploitation_step`, `privilege_gained`,
`lateral_movement`, `target_reached`, `business_impact`, `narrative`.

## Attack surface score

Deterministic formula from named factors:

- attack path count (weight 5, cap 25)
- average risk (weight 3.5, cap 30)
- maximum risk (weight 2, cap 15)
- max blast radius (weight 0.4, cap 20)
- bonuses: verified RCE (+10), high confidence (+5), credential (+8), lateral (+7)

Classification: Minimal (0–20), Low (21–40), Moderate (41–60), High (61–80),
Critical (81–100).

Metasploitable scores **Critical** (~86/100) — expected for a vulnerable lab with
4 verified RCE paths.

## Remediation engine

Rule table keyed to software fingerprints and attack categories (`vsftpd`,
`samba`, `tomcat`, `iam_role`, `remote_rce`, …). Each item includes:

- `fix`, `difficulty`, `expected_risk_reduction`, `expected_confidence_reduction`
- `affected_attack_paths`

## Model changes (additive)

`AttackPath`: `attack_story: dict`

`InvestigationReport`: `attack_surface_score`, `attack_surface_classification`,
`attack_surface_proof`, `graph_proof`

`vayne/models/` package (Phase H) — imports unchanged via `from vayne.models import …`.

## Parity evidence

After Phase I, Metasploitable remains:

```
paths      = 4
confidence = [83, 92, 100, 100]
risk       = [6.5, 7.2, 8.6, 8.6]
categories = remote_rce (all 4)
```

Verified by `test_metasploitable_parity_after_export`, existing Phase D–H tests,
and full suite **208 passed**.

## Tests added (24)

| File | Coverage |
|---|---|
| `test_production_exports.py` | All 9 artifact files exist + JSON shapes |
| `test_attack_stories.py` | Story fields, vsftpd CVE, determinism |
| `test_executive_reports.py` | Required executive sections |
| `test_analyst_reports.py` | Analyst sections + categories |
| `test_remediation_plans.py` | Remediation item schema |
| `test_graph_exports.py` | Visualization node/edge fields |
| `test_attack_surface_scoring.py` | Score range + determinism |
| `test_phase_i_determinism.py` | 10-run export hash + parity |

## Limitations

- Session-random UUIDs on finding/path IDs still exist internally; exports include
  `stable_id` on attack paths and sort findings deterministically. Core attack
  path **node sequences** remain deterministic (100-run tests from Phases D–H).
- Attack stories use template assembly — complex multi-stage cloud/AD paths may
  produce shorter narratives until richer node metadata is present.
- Remediation rules cover common Metasploitable/cloud patterns; extend the rule
  table for new software fingerprints.

## Future roadmap

- Interactive graph viewer consuming `graph.json` position hints
- PDF export from executive/analyst markdown
- Customer-specific remediation SLA mapping
- Deterministic finding IDs (hash of host+title+cve) for full export byte stability

## Run

```powershell
.\.venv\Scripts\python.exe -m vayne.cli.app analyze examples\metasploit.xml -n prod-demo -o reports\prod-demo --proof
```

Outputs land in `reports\prod-demo\` with all Phase I artifacts.
