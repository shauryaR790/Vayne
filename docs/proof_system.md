# VAYNE Proof System (Phase G)

Every decision VAYNE makes is now an auditable artifact. The proof system lives
in the `vayne/attack_paths/proof/` package and the `*_proof` dataclasses.

## Package layout

```
vayne/attack_paths/
  confidence_proof.py     # ConfidenceFactor / ConfidenceProof (Phase E)
  risk_proof.py           # RiskFactor / RiskProof (Phase F)
  proof/
    __init__.py           # re-exports everything below
    graph.py              # ProofNode / ProofEdge / PathDiscoveryProof / GraphProof
    acceptance.py         # AcceptedPathProof + build_accepted_proof
    rejection.py          # RejectedPathProof + build_rejected_proof
    revival.py            # RevivalOption + suggest_revival()
    alternatives.py       # AlternativePath
```

`proof/` replaces the former `proof.py`; all original imports
(`from vayne.attack_paths.proof import GraphProof, ProofEdge, ...`) still work
via re-export, and `GraphProof.log_lines()` output is unchanged.

## Accepted path proof

Emitted for every accepted path (`AttackPath.accepted_proof`):

```text
PATH ACCEPTED
because:
  ✓ host reachable
  ✓ exploit available
confidence: 100%   (+ confidence_proof)
risk:       8.6    (+ risk_proof)
attacker effort: moderate   (+ effort_proof)
blast radius:    47 assets  (+ blast_proof)
assumptions: [...]
alternatives_rejected: [...]
```

Fields: `why_accepted`, `confidence_proof`, `risk_proof`, `blast_proof`,
`effort_proof`, `assumptions`, `alternatives_rejected`.

## Rejected path proof

Emitted for every rejected path (`PathDiscoveryProof.rejected_path_proofs[]`):

```text
PATH REJECTED
reason:  execution -> data_access impossible
missing:
  - credential
  - database auth evidence
revive_with:
  - secrets / credential discovery scan  (trufflehog, gitleaks, LaZagne)
  - database credential discovery
expected confidence if revived: 84%
```

Fields: `path`, `label`, `reject_reason`, `missing_evidence`, `revive_with`,
`confidence_if_revived`, `tools_that_can_provide_evidence`.

## Revival engine

`suggest_revival(missing_evidence)` deterministically routes each missing item to
a collection action + concrete tools + the capability it would unlock:

| Missing | Action | Tools | Unlocks |
|---|---|---|---|
| IAM role / cloud permission | IAM audit / permission enumeration | aws iam ..., ScoutSuite, Pacu | identity_escalation |
| credential / secret / token | secrets / credential discovery | trufflehog, gitleaks, LaZagne | credential_access |
| database auth | database credential discovery | trufflehog, credential spraying | data_access |
| lateral / trust / pivot | lateral movement / trust mapping | BloodHound, CrackMapExec | lateral_movement |
| network route / reachability | internal reachability scan | nmap | initial_access |
| privilege escalation | privesc enumeration | linpeas, winpeas | privilege_escalation |
| exploit / CVE | exploit validation | metasploit, manual PoC | code_execution |
| persistence / cron | persistence audit | scheduled task / service account review | persistence |

Output is deduplicated and order-stable (first matching rule wins).

## Alternative paths

For an accepted path, `AttackPath.alternatives` lists rejected paths that shared
the same entry or terminal, each as an `AlternativePath`:

```text
accepted: internet -> CVE -> IAM -> RDS
rejected: internet -> CVE -> domain admin
reason:   missing privilege escalation   (confidence if revived: 61%)
```

Sorted by would-be confidence (desc), then label.

## Determinism & completeness guarantees

- `test_phase_fg_determinism.py` — full proof signature identical over 100 runs.
- `test_acceptance_proof.py` — every accepted path has confidence/risk/blast/
  effort proofs and a non-empty `why_accepted`.
- `test_rejection_proof.py` — every rejected path has reason + missing evidence +
  revival.
- `test_risk_proof.py` / `test_risk_calibration.py` — risk fully reconstructable
  from named factors; no hidden constants.
