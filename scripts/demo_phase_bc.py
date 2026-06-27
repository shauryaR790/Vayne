"""Manual demonstration of Phase B (capability transitions) and Phase C
(exploit intelligence domains). Run: python scripts/demo_phase_bc.py
"""

from pathlib import Path

from vayne.attack_paths.capabilities import transitions_are_valid
from vayne.attack_paths.discovery import discover_attack_paths
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.models import (
    Asset,
    AttackCapability as C,
    Classification,
    CorrelatedFinding,
    ValidationResult,
)
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

ROOT = Path(__file__).resolve().parent.parent


def run_scan(rel_path):
    findings, assets = load_scan_files([ROOT / rel_path])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    validations = {c.id: validate_finding(c, assets) for c in correlated}
    return discover_attack_paths(findings, assets, correlated, validations)


def confirmed():
    return ValidationResult(
        host_alive=True, port_open=True, service_exists=True, cve_applicable=True,
        prerequisites_met=True, reachable=True, confidence=90,
        classification=Classification.CONFIRMED,
    )


def synth(evidence, host="cloudhost", port=443):
    cf = CorrelatedFinding(
        id="f1", title="Cloud misconfig RCE", host=host, port=port,
        severity="high", cve="CVE-2099-0001", evidence=evidence, sources=["burp"],
    )
    assets = [Asset(host=host, ip="10.0.0.9", ports=[port])]
    return discover_attack_paths([], assets, [cf], {cf.id: confirmed()})


print("=" * 72)
print("PHASE B -- Metasploitable parity + capability chains")
print("=" * 72)
paths, _ = run_scan("examples/metasploit.xml")
print(f"attack paths: {len(paths)}  (expected 4)")
for p in sorted(paths, key=lambda x: (x.confidence, x.risk_score)):
    print(f"  conf={p.confidence:>3}%  risk={p.risk_score}  caps={p.capability_chain}")

print("\nPhase B transition validator (direct):")
checks = [
    ("INITIAL->EXECUTION->PRIVESC (valid)",
     [C.INITIAL_ACCESS, C.EXECUTION, C.PRIVILEGE_ESCALATION]),
    ("INITIAL->DOMAIN_COMPROMISE (impossible)",
     [C.INITIAL_ACCESS, C.DOMAIN_COMPROMISE]),
    ("EXECUTION->DATA_ACCESS = service->db w/o creds (impossible)",
     [C.INITIAL_ACCESS, C.EXECUTION, C.DATA_ACCESS]),
    ("privesc<->lateral loop (valid)",
     [C.INITIAL_ACCESS, C.EXECUTION, C.PRIVILEGE_ESCALATION,
      C.LATERAL_MOVEMENT, C.PRIVILEGE_ESCALATION]),
]
for name, chain in checks:
    ok, issues = transitions_are_valid(chain)
    tag = "OK    " if ok else "REJECT"
    print(f"  [{tag}] {name}")
    for i in issues:
        print(f"           - {i}")

print("\n" + "=" * 72)
print("PHASE C -- credential / cloud / identity / lateral intelligence")
print("=" * 72)

ev_good = [
    "Exposed AWS access key AKIAABCDEFGHIJKLMNOP in public bucket",
    "Bucket policy grants sts:AssumeRole to arn:aws:iam::123456789012:role/AppRole",
    "Assumed role allows rds-db:connect to RDS postgres "
    "at app.abcd.us-east-1.rds.amazonaws.com:5432",
]
paths, _ = synth(ev_good)
print("ACCEPTED -- AWS key -> IAM role -> RDS (data access):")
for p in paths:
    if "data_access" in p.capability_chain:
        print("  " + " -> ".join(n.label[:30] for n in p.nodes))
        print(f"    caps={p.capability_chain}")
        print(f"    confidence={p.confidence}%  risk={p.risk_score}")

print("\nREJECTED -- service -> database without credentials:")
paths, _ = synth(["A postgres database exists at db.example.com:5432"])
n = sum(1 for p in paths if "data_access" in p.capability_chain)
print(f"  data_access paths found: {n}  (expected 0)")

print("\nREJECTED -- AWS key alone -> domain admin:")
paths, _ = synth(["Exposed AWS access key AKIAABCDEFGHIJKLMNOP and arn:aws:iam::1:role/AppRole"])
n = sum(1 for p in paths if "domain_compromise" in p.capability_chain)
print(f"  domain_compromise paths found: {n}  (expected 0)")

print("\nNO EVIDENCE -> NO PATH:")
paths, _ = synth(["benign service banner only"])
n = sum(1 for p in paths if any(e.source_tool.endswith("_intel") for e in p.edges))
print(f"  intel paths: {n}  (expected 0)")
