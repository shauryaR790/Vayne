# VAYNE Roadmap & Refactor Plan

> Companion to `docs/architecture_audit.md`.
> Status: **PROPOSAL — awaiting approval before any engine code changes.**
> Guardrails (non-negotiable): deterministic, evidence-based, explainable, analyst-auditable,
> graph-first. No hardcoded paths/scores, no LLM reasoning, proof mode preserved.

---

## 1. Current maturity estimate

| Capability | Maturity | Notes |
|---|---|---|
| Scan ingestion (host/web) | 75% | 8 parsers solid; no cloud/secret/IaC/identity |
| Correlation | 55% | host+port+cve only; no cross-host/credential |
| Validation / FP reduction | 70% | strong OBSERVED model; keyword-driven noise |
| Graph construction | 60% | excellent spine; node creation hardcoded |
| Exploit intelligence | 35% | software→CVE only; 4 domains missing |
| Path discovery | 45% | correct but `all_simple_paths`, no heuristic |
| Path reasoning / capabilities | 55% | monotonic chain; missing persistence/domain |
| Confidence engine | 65% | multiplicative; residual hardcoded floors |
| Risk scoring | 55% | good base; missing business/data/identity |
| Proof mode | 70% | great for edges; weak for rejected *paths* |
| Reporting | 50% | investigation.* only; no exec/MITRE/categories |
| **Overall** | **≈ 55%** | strong deterministic core; narrow surface |

---

## 2. Architecture weaknesses (ranked)
1. **Narrow input surface** — only host/web scanners parse.
2. **Hardcoded graph construction** — no typed node model / node factory.
3. **`all_simple_paths`** — non-scalable, truncates best paths.
4. **Single-domain exploit intelligence** — software→CVE only.
5. **Residual hardcoded confidence floors/boosts.**
6. **Risk model missing business/data/identity context.**
7. **Rejected-path proof not actionable.**
8. **No path categorization / MITRE / exec reporting.**

## 3. False-positive sources
- Hand-maintained noise keyword list.
- Confidence boosts overstate single-tool findings.
- Acceptance at `access:` outcome without downstream value.

## 4. False-negative sources
- Missing parsers (cloud, secrets, IaC, identity, k8s, CI/CD).
- Missing node types + exploit-intel domains.
- Path truncation caps.
- No cross-host credential/identity correlation.

## 5. Missing attack categories (Phase 9)
`remote_rce` (partial), `credential_attack`, `privilege_escalation`,
`lateral_movement`, `cloud_attack`, `identity_attack`, `container_escape`,
`domain_compromise`, `data_exfiltration`, `supply_chain` — **none formally classified.**

## 6. Missing graph entities (Phase 2)
role, admin, domain, secret, api_key, jwt, storage, rds, redis, message_queue,
internal_service, ssh_key, vpn, network_share, kubernetes, container, pod,
iam_role, service_account, cloud_resource, github_repo, ci_cd, pipeline,
webhook, email, session.

## 7. Missing exploit intelligence (Phase 3)
- **Credential intel:** AWS keys, JWTs, GitHub tokens, API keys, SSH keys, DB passwords, `.env`, cookies, sessions.
- **Cloud intel:** S3, IAM, STS AssumeRole, RDS, Secrets Manager, Lambda, Azure, GCP SAs.
- **Lateral intel:** credential reuse, trust relationships, shared secrets, network access, pivots.
- **Identity escalation intel:** sudo, assume-role, admin groups, service accounts, domain admin, k8s admin.

---

## 8. Recommended refactor (incremental, additive, test-gated)

Each step keeps existing behavior green (56 tests today) and adds tests before merging.

### Step A — Typed node model + node factory (enables everything)
- Add `NodeType` values (Phase 2) + a `GraphNode` typed model carrying
  `evidence, finding_ids, confidence, blast_radius, capability, criticality,
  source_tool, validation_status`.
- Introduce a **node factory** in `graph_builder` so new types don't require core edits.
- **Risk:** low (additive). **Tests:** node-field presence, backward-compat on metasploit/firstrun.

### Step B — Capability model completion (Phase 5)
- Add `EXECUTION` alias, `DOMAIN_COMPROMISE`; include `PERSISTENCE` in ordering.
- Capability transition matrix with allowed transitions (incl. lateral↔privesc loops).
- Enforce "credential OR privilege before high-value asset".
- **Tests:** reject impossible chains; metasploitable paths still valid.

### Step C — Exploit-intelligence domains (Phase 3)
- New modules under `attack_paths/intel/`: `credential_intel.py`, `cloud_intel.py`,
  `lateral_intel.py`, `identity_intel.py`, each evidence-driven (no guessing).
- Wire into `graph_builder` via the node factory + validated links.
- **Tests:** synthetic fixtures (leaked AWS key → role → RDS) produce a path *only* with evidence.

### Step D — Heuristic path search (Phase 4)
- Replace `all_simple_paths` with **weighted beam search + A\*** keyed on
  exploitability × confidence × criticality × privilege-gain; keep deterministic ordering (stable tiebreak).
- Keep `all_simple_paths` behind a flag for small-graph parity testing.
- Reject terminals at inventory/software/service/candidate-CVE/no-privilege.
- **Tests:** large synthetic graph returns top-K correctly; metasploitable parity.

### Step E — Confidence engine cleanup (Phase 6)
- Remove residual hardcoded floors; derive every factor from evidence.
- Emit a structured `ConfidenceProof` per edge and per path.
- **Tests:** no magic constants; proof object well-formed; calibration ranges hold.

### Step F — Risk model expansion (Phase 7)
- Add business criticality, data sensitivity, identity impact, lateral/persistence capability, chain complexity, attacker effort, public-exploit availability.
- Emit `RiskProof`.
- **Tests:** unauth RCE 8–10, authed RCE 6–8, info-disclosure 2–5, inventory <2.

### Step G — Proof mode upgrade (Phase 8)
- Rejected path → `{why, missing_evidence, revive_with, tool_that_provides, confidence_delta}`.
- Accepted path → `{why, alternatives_rejected, assumptions, confidence_proof, risk_proof, blast_proof, effort_proof}`.
- **Tests:** every rejected path has structured revival data.

### Step H — Path categories (Phase 9)
- Deterministic classifier from node/edge/capability signatures → 10 categories.
- **Tests:** vsftpd→remote_rce; leaked-key→cloud_attack; etc.

### Step I — Analyst + executive reporting (Phase 10)
- Make `graph.json/attack_paths.json/findings.json/proof.txt` first-class exporter outputs.
- Add `executive_report.{md,html}`; attack story, kill chain, MITRE mapping, business impact, remediation, analyst notes.
- **Tests:** all artifacts produced; schema checks.

---

## 9. Priority order
1. **A** (typed nodes/factory) — unblocks 2,3,9,10.
2. **B** (capabilities) — unblocks 4,5.
3. **C** (intel domains) — biggest FN reduction.
4. **D** (search) — scalability + truncation fix.
5. **E** (confidence) + **F** (risk) — calibration integrity.
6. **G** (proof) — analyst trust.
7. **H** (categories) + **I** (reports) — deliverable polish.

## 10. Estimated completion after roadmap
- Today: **≈ 55%**.
- After A–B: **≈ 63%**.
- After C: **≈ 72%**.
- After D: **≈ 80%**.
- After E–F: **≈ 86%**.
- After G–I: **≈ 93%** (production-grade for the stated objective).

---

## 11. What will NOT change
- Determinism, evidence-first edges, proof mode, path validation,
  exploit intelligence (extended, not replaced), rejected-path reasoning,
  analyst explanations, false-positive reduction. All additive and test-gated.
