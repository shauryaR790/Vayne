# VAYNE Architecture Audit (Phase 1)

> Status: **AUDIT ONLY — no engine code changed.**
> Scope: full attack-path pipeline as it exists today.
> Method: line-level read of every module in `vayne/attack_paths/`, `vayne/validator/`,
> `vayne/correlator/`, `vayne/exploitability/`, `vayne/parsers/`, plus `models.py`.

---

## 1. Pipeline as built today

```
parsers/loader.py        (nmap, nessus, openvas, burp, httpx, naabu, katana, nuclei)
        ↓
correlator/engine.py     (bucket by host|port|cve, merge sources)
        ↓
validator/engine.py      (OBSERVED / UNCONFIRMED / FALSE POSITIVE + confidence)
        ↓
attack_paths/graph_builder.py     (SecurityGraphBuilder → networkx.DiGraph)
        ├── software.py            (fingerprint parsing)
        ├── exploit_intelligence.py(software → CVE → verified → exploit → access)
        ├── evidence_entities.py   (regex extract: ARN, conn string, AWS key, GH token, bucket)
        ├── artifact_links.py      (validated cred/role/db edges)
        ├── evidence_tiers.py      (TIER1/2/3)
        └── blast_radius.py        (annotate reachability)
        ↓
attack_paths/discovery.py         (nx.all_simple_paths enumerate → validate → score)
        ├── path_reasoning.py      (validate_full_path, confidence aggregation, effort)
        ├── terminals.py           (is_terminal_target)
        ├── capabilities.py        (capability chain logic)
        ├── confidence_model.py    (multiplicative confidence)
        ├── scoring.py             (risk model)
        └── asset_criticality.py   (terminal weights)
        ↓
attack_paths/proof.py             (GraphProof audit log)
        ↓
analyst/engine.py + reporting/generator.py  (brief + investigation.{json,md,html})
```

Confirmed working end-to-end on `examples/metasploit.xml` → 4 valid paths
(vsftpd 100%/8.6, Samba 100%/8.6, Tomcat 92%/7.2, ProFTPD 83%/6.5).

---

## 2. Per-file audit

### 2.1 `parsers/loader.py`
- **Does:** dispatch by filename hint / JSON shape / XML root to 8 parsers; recurse a directory for `*.json`/`*.xml`.
- **Assumes:** every input is a host/port/web scanner artifact.
- **Limitations:** no cloud-posture (Prowler/ScoutSuite), no secret scanners (gitleaks/trufflehog), no IaC/SAST, no CI/CD, no identity-provider exports, no Kubernetes manifests.
- **FN source:** entire classes of attack surface (cloud, identity, secrets, supply chain) cannot enter the graph because no parser emits them.

### 2.2 `correlator/engine.py`
- **Does:** bucket findings by `host|port|cve`, merge sources/evidence, compute correlation confidence.
- **Assumes:** identity = host+port+cve. Evidence truncated to 8 items.
- **Limitations:** no cross-host correlation, no credential/identity correlation, no temporal correlation. Two findings describing the same leaked key on different hosts never merge.
- **FN source:** shared-secret / credential-reuse relationships are invisible at correlation time.

### 2.3 `validator/engine.py`
- **Does:** computes 11 boolean checks, classifies OBSERVED / UNCONFIRMED / FALSE POSITIVE / CONFIRMED / LIKELY, derives confidence (exploit model for CVEs, observation model 70–85% for inventory).
- **Assumes:** exploitability is essentially host/port/version/CVE driven. `_vuln_type` keys off substrings (`apache`, `s3`, `iam`, `database`).
- **Limitations:** credential/identity/cloud findings get only coarse `vuln_type` handling; no validation of "is this AWS key live", "does this role trust this principal", "is this DB reachable from this host".
- **FP source:** keyword `NOISE_TITLE_MARKERS` list is hand-maintained; novel noise slips through.
- **FN source:** a real leaked-credential finding with no CVE and no port can be classified OBSERVED and never enters the graph (only `is_security_finding` items do).

### 2.4 `attack_paths/graph_builder.py` (836 lines — the core)
- **Does:** builds entry→asset→service→software, runs `_enrich_software_exploits` (candidate→verified→exploit→access), extracts evidence entities, builds validated cred/role/db links, annotates blast radius.
- **Assumes:** the spine is always `internet → asset → service → software`. CVE chain only attaches to `software` nodes.
- **Limitations:**
  - Node creation is **hardcoded per artifact type** — adding a node type means editing this file.
  - Credential/identity/database nodes only appear if `evidence_entities.py` regexes match; there is no generic "node from finding" factory.
  - Edge confidence for inventory is **hardcoded** (`service_fingerprint=84`, `open_port=76`, generic `72`).
- **FN source:** any attack step not expressible as software→CVE or one of the ~6 regex artifacts cannot be built.

### 2.5 `attack_paths/exploit_intelligence.py`
- **Does:** `EXPLOIT_KB` maps `(vendor, product) → [ExploitRecord]`; `evaluate_applicability` checks version/port/prereqs; `compute_exploit_confidence` scores.
- **Assumes:** exploitation = a CVE against a software version. Verification modes: `exact_version`, `port_version`, `prerequisites`.
- **Limitations:**
  - **No credential intelligence** (AWS key → what it unlocks), **no cloud intelligence** (S3→IAM→STS→RDS), **no lateral-movement intelligence** (cred reuse / trust), **no identity-escalation intelligence** (sudo / assume-role / admin groups).
  - `compute_exploit_confidence` still contains **maturity floors** (`max(conf, 92)`, `min(98, …)`) — semi-hardcoded, not purely evidence-derived.
- **FN source:** the four missing intelligence domains are exactly the ones needed for the target objective (credential→identity→lateral→data).

### 2.6 `attack_paths/discovery.py`
- **Does:** `nx.all_simple_paths(entry, terminal, cutoff=12)` for every (entry × terminal), capped at `PATH_ENUM_LIMIT=500`, validate each, score, keep top `MAX_PATHS=50`.
- **Assumes:** graph is small enough for full simple-path enumeration.
- **Limitations:**
  - **Exponential blow-up risk** — on a dense real graph, `all_simple_paths` explodes; the 500 cap silently truncates and ordering is arbitrary (insertion order), so the *best* paths may never be scored.
  - **No prioritization / heuristic / weighting during search** — exploitability and criticality are applied only *after* enumeration.
- **FN/truncation source:** on large graphs, high-value paths beyond the 500/50 cutoffs are dropped before scoring.

### 2.7 `attack_paths/path_reasoning.py`
- **Does:** `validate_full_path` (edge evidence, verified-exploit/validated-finding requirement, terminal requirement, capability-chain logic); `compute_path_confidence` (infra vs exploit weighted); `compute_attacker_effort`; `build_path_analyst_explanation`.
- **Assumes:** a path is valid if it has a verified exploit or validated finding AND ends at a terminal/exploit-outcome.
- **Limitations:**
  - Capability transition model is **linear/monotonic** (no PERSISTENCE / DOMAIN_COMPROMISE stages; PERSISTENCE not even in the ordering list).
  - No explicit "credential OR privilege required before high-value asset" rule — relies on terminal classification.
- **FP source:** a path can terminate at an `access:` exploit-outcome node and be accepted without ever modelling what that access *yields* downstream.

### 2.8 `attack_paths/confidence_model.py`
- **Does:** `compute_confidence` = scanner × corroboration × maturity × applicability × environmental; `compute_observation_confidence` (70–85); `compute_path_confidence_multiplicative` (infra/exploit weighted + verified boost).
- **Limitations:** `compute_observation_confidence` is **additive with a hardcoded base (68)**; verified-path boosts (`1.08/1.12`) are constants, not derived from evidence counts. No `confidence_proof` object — breakdown is a list of strings, not a structured, queryable proof.
- **FP/over-confidence source:** boosts can push weaponized paths to 99–100% even with single-tool corroboration.

### 2.9 `attack_paths/scoring.py`
- **Does:** `risk = cvss × maturity × access × auth × evidence × blast × privilege`, with floors for unauth weaponized RCE (≥8.5) and functional RCE (≥7.0).
- **Limitations:** missing **business criticality, data sensitivity, identity impact, persistence capability, lateral-movement capability, chain complexity** as explicit factors. `cvss` falls back to `path_conf/10` when absent (couples risk to confidence). Floors are hardcoded.

### 2.10 `attack_paths/terminals.py` + `asset_criticality.py`
- **Does:** terminal = `is_exploit_outcome` OR criticality weight ≥ 5.5; criticality from keyword markers (prod/payment/k8s/vault/DC/ssh).
- **Limitations:** keyword-driven; no notion of business-tagged assets, data sensitivity labels, or environment (prod vs dev) beyond substrings. Many requested terminal types (rds, redis, message_queue, kubernetes, container, github_repo, ci_cd) have **no classification rules**.

### 2.11 `attack_paths/capabilities.py`
- **Does:** node/edge → `AttackCapability`; `chain_is_logical` enforces monotonic order.
- **Limitations:** ordering list omits PERSISTENCE; no DOMAIN_COMPROMISE; no LATERAL_MOVEMENT→PRIVILEGE_ESCALATION cycles (real attacks loop). `EXECUTION` requested by the spec is modelled as `CODE_EXECUTION`.

### 2.12 `attack_paths/proof.py`
- **Does:** structured nodes/edges/rejected-edges, path-discovery stats, `log_lines()`.
- **Limitations (Phase 8 gaps):** rejected **paths** carry only a reason string. No: *what evidence is missing*, *what would revive the path*, *which tool could supply it*, *confidence delta if found*. Accepted paths lack a structured *risk proof / blast proof / effort proof* object (these live as loose strings on `AttackPath.scoring`).

### 2.13 `reporting/generator.py`
- **Does:** writes `investigation.{json,md,html}`.
- **Limitations:** does **not** emit `graph.json`, `attack_paths.json`, `findings.json`, `proof.txt` (these were produced by an ad-hoc script). No `executive_report.*`, no MITRE mapping, no kill chain, no attack story, no path categories.

---

## 3. Cross-cutting findings

### 3.1 Node-type coverage
`models.NodeType` has **10** values (endpoint, asset, service, software, vulnerability, identity, credential, bucket, database, data). The spec requests **~35**. Missing: role, admin, domain, secret, api_key, jwt, storage, rds, redis, message_queue, internal_service, ssh_key, vpn, network_share, kubernetes, container, pod, iam_role, service_account, cloud_resource, github_repo, ci_cd, pipeline, webhook, email, session. **Nodes also lack first-class fields** (`confidence`, `blast_radius`, `capability`, `criticality`, `validation_status`) — these live as ad-hoc dict keys on the networkx node, not on a typed model.

### 3.2 Capability coverage
`AttackCapability` has 7 values but the chain validator only orders 6 and never uses PERSISTENCE/DOMAIN_COMPROMISE. The target objective (credential → identity → privesc → lateral → data → critical asset) is only partially encodable.

### 3.3 Exploit-intelligence coverage
Only **software→CVE** exists. The four domains required for the objective — credential, cloud, lateral-movement, identity-escalation intelligence — are **absent**.

### 3.4 Search algorithm
`all_simple_paths` with hard caps is the single biggest scalability and **false-negative-by-truncation** risk. No beam/A*/weighted search.

### 3.5 Determinism & explainability (strengths to preserve)
- Fully deterministic (no randomness, no LLM).
- Every edge has evidence + discovered_from + validation_checks.
- Proof mode logs every node/edge/rejected-edge.
- These are VAYNE's crown jewels and must survive the refactor unchanged in spirit.

---

## 4. Root-cause summary table

| Symptom | Root cause | File(s) |
|---|---|---|
| Can't model cloud/identity/secret attacks | No parsers + no node types + no exploit-intel domains | loader, models, exploit_intelligence |
| Paths truncate on big graphs | `all_simple_paths` + 500/50 caps, no heuristic | discovery |
| Best paths sometimes missed | Scoring applied after enumeration, not during | discovery |
| Over-confidence on single tool | Hardcoded maturity floors / boosts | confidence_model, exploit_intelligence |
| Risk ignores business/data context | Missing factors in risk model | scoring, asset_criticality |
| Rejected paths not actionable | No "missing evidence / revive / delta" proof | proof |
| No exec report / MITRE / categories | Reporting layer never built them | generator |
| Adding a node type = editing core | No node factory / typed node model | graph_builder, models |

---

## 5. False-positive sources
1. Hand-maintained `NOISE_TITLE_MARKERS` keyword list (validator).
2. Confidence boosts/floors can over-state single-corroboration findings.
3. Paths accepted at `access:` outcome without modelling downstream value.

## 6. False-negative sources
1. Missing parsers (cloud, secrets, IaC, identity, k8s, CI/CD).
2. Missing node types and exploit-intelligence domains.
3. `all_simple_paths` 500/50 truncation on dense graphs.
4. No cross-host credential/identity correlation.

## 7. Attack-path truncation sources
1. `cutoff=MAX_HOPS=12`, `PATH_ENUM_LIMIT=500`, `MAX_PATHS=50`.
2. Insertion-order enumeration → arbitrary which paths survive the cap.
3. Terminal set restricted to weight≥5.5 / exploit-outcome.
