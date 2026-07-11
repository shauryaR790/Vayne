"""Phase 1 — evidence-driven confidence + canonical correlation.

These lock the three foundational guarantees:

* confidence emerges from a weighted feature vector (no base score) and spreads
  naturally across findings,
* every dimension is explainable (score == sum of its factor deltas), and
* correlation resolves scanner terminology into canonical entities with
  automatically computed scanner agreement, version agreement, and conflicts.
"""

from __future__ import annotations

from pathlib import Path

from vayne.confidence import compute_finding_confidence
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.correlator.normalization import resolve_entity
from vayne.models import Finding
from vayne.parsers.loader import load_scan_files
from vayne.validator.engine import validate_finding

EXAMPLES = Path(__file__).parent.parent / "examples"
SCAN_RESULTS = EXAMPLES / "scan_results"
METASPLOIT = EXAMPLES / "metasploit.xml"


def _validated(scan_path: Path):
    findings, assets = load_scan_files([scan_path])
    assets = correlate_assets(assets)
    correlated = correlate_findings(findings)
    return correlated, {c.id: validate_finding(c, assets) for c in correlated}


def _finding(**kw) -> Finding:
    base = dict(id=kw.pop("id", "f"), host="10.0.0.1", title="svc", source_tool="nmap")
    base.update(kw)
    return Finding(**base)


# --------------------------------------------------------------------------- #
# Normalization / canonical entities
# --------------------------------------------------------------------------- #
def test_scanner_terminology_resolves_to_one_canonical_product():
    variants = ["Apache httpd", "Apache HTTP Server", "Apache Server", "httpd"]
    products = {
        resolve_entity(title=v, service="http", evidence_texts=[], cve="", severity="info").product
        for v in variants
    }
    assert products == {"Apache HTTP Server"}


def test_ssh_terminology_normalizes():
    for v in ("OpenSSH 4.7p1", "ssh-service", "SSH", "sshd"):
        r = resolve_entity(title=v, service="ssh", evidence_texts=[], cve="", severity="info")
        assert r.product == "OpenSSH"


def test_correlation_merges_cross_terminology_across_tools():
    group = [
        _finding(id="a", port=80, title="Apache httpd 2.4.7", source_tool="nmap",
                 evidence="Server: Apache/2.4.7"),
        _finding(id="b", port=80, title="Apache HTTP Server detection", source_tool="nuclei",
                 evidence="apache 2.4.7"),
    ]
    correlated = correlate_findings(group)
    assert len(correlated) == 1
    merged = correlated[0]
    assert set(merged.sources) == {"nmap", "nuclei"}
    assert merged.canonical_entity.product == "Apache HTTP Server"
    assert "nmap" in merged.scanner_agreement.agreed
    assert "nuclei" in merged.scanner_agreement.agreed


def test_scanner_agreement_is_agreed_over_capable_not_vanity():
    # Only nmap reports it, but nessus + openvas are also present and capable.
    group = [
        _finding(id="a", port=443, title="OpenSSH 8.2", source_tool="nmap", evidence="OpenSSH 8.2"),
        _finding(id="x", port=22, title="Some Nessus plugin", source_tool="nessus", cve="CVE-2020-0001"),
        _finding(id="y", port=25, title="Some OpenVAS finding", source_tool="openvas", cve="CVE-2020-0002"),
    ]
    correlated = correlate_findings(group)
    ssh = next(c for c in correlated if c.canonical_entity.product == "OpenSSH")
    agr = ssh.scanner_agreement
    assert agr.agreed == ["nmap"]
    assert len(agr.capable) > 1
    assert agr.label != "1 / 1"


def test_version_conflict_recorded():
    group = [
        _finding(id="a", port=80, title="Apache httpd", source_tool="nmap", evidence="Apache/2.4.49"),
        _finding(id="b", port=80, title="Apache HTTP", source_tool="openvas", evidence="Apache 2.4.48"),
    ]
    merged = correlate_findings(group)[0]
    assert not merged.version_agreement.agreed
    assert any(c.kind == "version" for c in merged.conflicts)


# --------------------------------------------------------------------------- #
# Confidence engine — feature model, no base score, explainable
# --------------------------------------------------------------------------- #
def test_no_base_score_weak_evidence_stays_weak():
    weak = _finding(id="w", title="tcpwrapped", source_tool="nmap", evidence="tcpwrapped")
    merged = correlate_findings([weak])[0]
    res = compute_finding_confidence(merged, {"host_alive": True})
    assert res.observation < 40


def test_every_dimension_is_explainable():
    correlated, validations = _validated(SCAN_RESULTS)
    for c in correlated:
        v = validations[c.id]
        for dim, score in (
            ("observation", v.observation_confidence),
            ("reliability", v.reliability_confidence),
            ("exploit", v.exploit_confidence),
            ("impact", v.impact_confidence),
        ):
            factors = v.confidence_factors.get(dim, [])
            expected = max(0, min(100, sum(int(f["delta"]) for f in factors)))
            assert score == expected, f"{dim} score {score} != sum(factors) {expected}"


def test_confidence_dimensions_are_independent():
    correlated, validations = _validated(SCAN_RESULTS)
    apache = next(
        c for c in correlated
        if c.cve == "CVE-2021-41773" or "41773" in " ".join(c.evidence)
    )
    v = validations[apache.id]
    # A validated, exploitable, critical finding exercises all three dimensions.
    assert v.observation_confidence > 0
    assert v.exploit_confidence > 0
    assert v.impact_confidence > 0
    assert "exploit" in v.confidence_dimensions


def test_informational_findings_have_no_exploit_dimension():
    tcp = _finding(id="t", title="tcpwrapped", source_tool="nmap", evidence="tcpwrapped")
    merged = correlate_findings([tcp])[0]
    res = compute_finding_confidence(merged, {"host_alive": True, "port_open": True})
    assert res.exploit == 0
    assert "exploit" not in res.dimensions


def test_confidence_spreads_naturally():
    correlated, validations = _validated(SCAN_RESULTS)
    overalls = [validations[c.id].overall_confidence for c in correlated]
    distinct = len(set(overalls))
    # Natural spread: most findings differ, and the range is wide.
    assert distinct >= int(len(overalls) * 0.6)
    assert max(overalls) - min(overalls) >= 40


def test_contradiction_reduces_confidence():
    clean = correlate_findings([
        _finding(id="a", port=80, title="Apache httpd", source_tool="nmap", evidence="Apache/2.4.49", severity="high"),
    ])[0]
    conflicted = correlate_findings([
        _finding(id="a", port=80, title="Apache httpd", source_tool="nmap", evidence="Apache/2.4.49", severity="high"),
        _finding(id="b", port=80, title="Apache HTTP", source_tool="openvas", evidence="Apache 2.4.48", severity="low"),
    ])[0]
    clean_obs = compute_finding_confidence(clean, {"host_alive": True, "port_open": True}).observation
    conf_obs = compute_finding_confidence(conflicted, {"host_alive": True, "port_open": True})
    negatives = [f for f in conf_obs.factors["observation"] if f["delta"] < 0]
    assert any("onflict" in f["label"] for f in negatives)


def test_supporting_and_missing_evidence_present():
    correlated, validations = _validated(SCAN_RESULTS)
    apache = next(
        c for c in correlated
        if c.cve == "CVE-2021-41773" or "41773" in " ".join(c.evidence)
    )
    v = validations[apache.id]
    assert v.supporting_evidence
    assert v.missing_evidence


def test_confidence_is_deterministic():
    correlated, validations = _validated(SCAN_RESULTS)
    for c in correlated:
        v1 = validate_finding(c, [])
        v2 = validate_finding(c, [])
        assert v1.overall_confidence == v2.overall_confidence
        assert v1.confidence_factors == v2.confidence_factors
