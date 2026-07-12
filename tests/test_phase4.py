"""Phase 4 tests — closing the 7.5→8.5 holdbacks.

Covers the five gaps without regressing Phases 1-3 or attack-path parity:

1. Ground-truth validation loop (verified vs inferred; probe plans).
2. Enterprise parser breadth (Qualys / Rapid7 / SARIF / generic CSV+JSON).
3. Service-intelligence generalization (obscure services get tailored profiles).
4. Probability calibration (identity+honest by default; fit + Brier/ECE).
5. Scale/perf (evidence-quality memoization; bounded full investigation).
"""

from __future__ import annotations

import time
from pathlib import Path

from vayne.calibration import Calibrator, default_calibrator, evaluate_calibration
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.evidence.quality import aggregate_quality
from vayne.investigation import build_investigation
from vayne.models import Finding
from vayne.parsers import generic, qualys, rapid7, sarif
from vayne.parsers.loader import parse_file
from vayne.service_intel import get_profile
from vayne.service_intel.synthesize import synthesize_profile
from vayne.validation import extract_verification, run_validation_loop
from vayne.validator.engine import validate_finding


def _finding(**kw) -> Finding:
    base = dict(id="f", host="10.0.0.5", service="", port=80, severity="medium",
                cve="", title="Finding", evidence="", source_tool="nmap")
    base.update(kw)
    return Finding(**base)


def _one(findings):
    correlated = correlate_findings(findings)
    assets = correlate_assets([])
    c = correlated[0]
    return c, validate_finding(c, assets)


# --------------------------------------------------------------------------- #
# Gap 1 — ground-truth validation loop
# --------------------------------------------------------------------------- #
def test_verification_confirmed_only_with_real_evidence():
    observed = _one([_finding(id="1", source_tool="nmap", title="Apache 2.4.49",
                              evidence="Server: Apache/2.4.49")])
    confirmed = _one([_finding(id="2", source_tool="nessus", title="Apache 2.4.49",
                               evidence="Authenticated local check confirmed Apache/2.4.49")])
    v_obs = extract_verification(observed[0])
    v_conf = extract_verification(confirmed[0])
    assert v_obs.strength < v_conf.strength
    assert v_conf.authenticated is True
    assert v_obs.method == "observed"


def test_validation_loop_upgrades_confirmed_and_plans_probes():
    c, v = _one([_finding(id="1", source_tool="nessus", title="Apache 2.4.49",
                          cve="CVE-2021-41773",
                          evidence="Authenticated check reproduced exploit for CVE-2021-41773")])
    outcome = run_validation_loop(c, v)
    assert outcome.exploit_confirmed is True
    assert outcome.confidence_delta > 0
    # A confirmed finding no longer needs the exploit-replay probe.
    assert all(p.method != "exploit_replay" for p in outcome.next_probes)


def test_validation_loop_infers_and_offers_probes_when_unverified():
    c, v = _one([_finding(id="1", source_tool="httpx", service="http",
                          title="Web", evidence="http-title: Home")])
    outcome = run_validation_loop(c, v)
    assert outcome.exploit_confirmed is False
    assert outcome.next_probes  # concrete actions to close the gap
    assert any("replay" in p.method or "auth" in p.method for p in outcome.next_probes)


def test_investigation_exposes_validation_loop_and_marks_inferred():
    c, v = _one([_finding(id="1", source_tool="httpx", service="http",
                          title="Web", evidence="Server: nginx")])
    inv = build_investigation(c, v, [])
    assert "validation_loop" in inv
    assert inv["investigation_confidence"]["exploitability"]["verified"] in (True, False)
    assert "INFERRED" in inv["investigation_confidence"]["exploitability"]["reasoning"].upper() \
        or inv["investigation_confidence"]["exploitability"]["verified"]


# --------------------------------------------------------------------------- #
# Gap 2 — enterprise parser breadth
# --------------------------------------------------------------------------- #
def test_qualys_xml_and_csv(tmp_path: Path):
    xml = tmp_path / "qualys_report.xml"
    xml.write_text(
        """<ASSET_DATA_REPORT><HOST_LIST><HOST>
        <IP>10.0.0.5</IP><DNS>web01.corp</DNS>
        <VULN><QID>86002</QID><TITLE>Apache Path Traversal</TITLE>
        <SEVERITY>4</SEVERITY><CVE_ID>CVE-2021-41773</CVE_ID>
        <DIAGNOSIS>Authenticated scan found Apache 2.4.49</DIAGNOSIS><PORT>443</PORT></VULN>
        </HOST></HOST_LIST></ASSET_DATA_REPORT>""",
        encoding="utf-8",
    )
    findings, _ = parse_file(xml)
    assert findings and findings[0].source_tool == "qualys"
    assert findings[0].cve == "CVE-2021-41773"
    assert findings[0].severity == "high"

    csv = tmp_path / "qualys_export.csv"
    csv.write_text(
        "IP,DNS,QID,Title,Severity,CVE ID,Results\n"
        "10.0.0.6,db01.corp,19506,MySQL Weak Auth,3,CVE-2020-0000,Anonymous login allowed\n",
        encoding="utf-8",
    )
    fcsv, _ = parse_file(csv)
    assert fcsv and fcsv[0].host == "db01.corp"
    assert fcsv[0].severity == "medium"


def test_rapid7_nexpose_xml(tmp_path: Path):
    xml = tmp_path / "rapid7_scan.xml"
    xml.write_text(
        """<NexposeReport><VulnerabilityDefinitions>
        <VulnerabilityDefinition id="apache-cve" title="Apache RCE" severity="critical">
        <reference source="CVE">CVE-2021-41773</reference>
        <description>Apache path traversal to RCE</description></VulnerabilityDefinition>
        </VulnerabilityDefinitions>
        <nodes><node address="10.0.0.5"><name>web01</name>
        <tests><test id="apache-cve" status="vulnerable-version">confirmed</test></tests>
        </node></nodes></NexposeReport>""",
        encoding="utf-8",
    )
    findings, _ = parse_file(xml)
    assert findings and findings[0].source_tool == "rapid7"
    assert findings[0].cve == "CVE-2021-41773"
    assert findings[0].severity == "critical"


def test_sarif_burp_enterprise(tmp_path: Path):
    sf = tmp_path / "burp.sarif"
    sf.write_text(
        """{"version":"2.1.0","runs":[{"tool":{"driver":{"name":"Burp Enterprise",
        "rules":[{"id":"sqli","name":"SQL injection",
        "shortDescription":{"text":"SQL injection"},
        "properties":{"security-severity":"9.1","tags":["CWE-89"]}}]}},
        "results":[{"ruleId":"sqli","level":"error",
        "message":{"text":"SQL injection in login"},
        "locations":[{"physicalLocation":{"artifactLocation":{"uri":"https://app.corp:443/login"}}}]}]}]}""",
        encoding="utf-8",
    )
    findings, _ = parse_file(sf)
    assert findings
    assert findings[0].source_tool == "burp-enterprise"
    assert findings[0].severity == "critical"
    assert findings[0].host == "app.corp"
    assert findings[0].cwe == "CWE-89"


def test_generic_cloud_posture_json(tmp_path: Path):
    jf = tmp_path / "prowler_findings.json"
    jf.write_text(
        """{"findings":[
        {"check_title":"S3 bucket public","severity":"high",
         "resource_id":"my-bucket","region":"us-east-1",
         "status_detail":"Bucket allows public read"}]}""",
        encoding="utf-8",
    )
    findings, _ = generic.parse_json(jf)
    assert findings
    assert findings[0].severity == "high"
    assert "bucket" in findings[0].host.lower() or "bucket" in findings[0].title.lower()


def test_generic_csv_column_heuristics(tmp_path: Path):
    cf = tmp_path / "export.csv"
    cf.write_text(
        "Hostname,Port,Risk,Finding,Description,CVE\n"
        "host-x,8080,Critical,Struts RCE,Remote code execution,CVE-2017-5638\n",
        encoding="utf-8",
    )
    findings, _ = generic.parse_csv(cf)
    assert findings
    assert findings[0].host == "host-x"
    assert findings[0].port == 8080
    assert findings[0].severity == "critical"
    assert findings[0].cve == "CVE-2017-5638"


# --------------------------------------------------------------------------- #
# Gap 3 — service intelligence generalization
# --------------------------------------------------------------------------- #
def test_obscure_service_gets_category_profile_not_flat_generic():
    c, _ = _one([_finding(id="1", host="10.0.0.9", port=5672, service="amqp",
                          title="RabbitMQ 3.9 broker", evidence="AMQP 0-9-1 broker")])
    profile = get_profile(c)
    assert profile.key.startswith("synth:")
    assert "message_queue" in profile.key
    # Category-specific, not the flat generic surface.
    joined = " ".join(profile.typical_attack_surface).lower()
    assert "broker" in joined or "queue" in joined or "console" in joined


def test_synthesis_differs_by_category():
    db = synthesize_profile(_one([_finding(id="1", port=5432, service="postgresql-ish",
                                           title="CustomDB 1.0")])[0])
    web = synthesize_profile(_one([_finding(id="2", port=8080, service="http",
                                            title="Custom Web App")])[0])
    assert db.typical_attack_surface != web.typical_attack_surface
    assert db.business_impact_model.get("data_sensitivity") == "critical"


def test_synthesized_profile_yields_recommendations():
    from vayne.service_intel import recommendations_for

    c, v = _one([_finding(id="1", port=53, service="dns", title="BIND 9.11",
                          evidence="named 9.11")])
    recs = recommendations_for(c, v)
    assert recs
    assert any("zone transfer" in r["action"].lower() or "axfr" in r["action"].lower()
               for r in recs)


# --------------------------------------------------------------------------- #
# Gap 4 — probability calibration
# --------------------------------------------------------------------------- #
def test_default_calibration_is_identity_and_honest():
    cal = Calibrator()
    cv = cal.calibrate(71, "hypothesis")
    assert cv.calibrated == 71
    assert cv.calibrated_flag is False
    assert "uncalibrated" in cv.method


def test_fit_maps_toward_observed_frequency():
    cal = Calibrator(bins=5)
    # Predictions of ~0.8 that only come true ~40% of the time should calibrate
    # downward once fit against outcomes.
    samples = [(0.8, i < 4) for i in range(10)]  # 40% positive
    cal.fit("hypothesis", samples)
    cv = cal.calibrate(0.8, "hypothesis")
    assert cv.calibrated_flag is True
    assert cv.calibrated < 0.8


def test_evaluation_reports_brier_and_ece():
    perfect = [(1.0, True), (0.0, False), (1.0, True), (0.0, False)]
    report = evaluate_calibration(perfect)
    assert report["brier"] == 0.0
    assert report["ece"] == 0.0
    assert report["samples"] == 4


def test_isotonic_curve_is_monotonic():
    cal = Calibrator(bins=4)
    samples = []
    for p, rate in ((0.1, 0.1), (0.4, 0.5), (0.6, 0.4), (0.9, 0.95)):
        samples += [(p, True)] * int(rate * 10) + [(p, False)] * int((1 - rate) * 10)
    cal.fit("x", samples)
    vals = [cal.calibrate(p, "x").calibrated for p in (0.1, 0.4, 0.6, 0.9)]
    assert vals == sorted(vals)  # non-decreasing


def test_hypotheses_carry_calibration_metadata():
    from vayne.investigation.hypotheses import build_hypotheses

    c, v = _one([_finding(id="1", source_tool="nmap", title="Apache 2.4.49",
                          evidence="Server: Apache/2.4.49", cve="CVE-2021-41773")])
    hyps = build_hypotheses(c, v)
    assert all("calibration" in h and "probability_raw" in h for h in hyps)


# --------------------------------------------------------------------------- #
# Gap 5 — scale / performance
# --------------------------------------------------------------------------- #
def test_aggregate_quality_is_memoized():
    findings = [_finding(id="1", source_tool="nmap", title="Apache", evidence="Server: Apache/2.4.49")]
    a = aggregate_quality(findings)
    b = aggregate_quality(findings)
    assert a is b  # cache hit returns the same object


def test_intelligence_scales_to_many_findings():
    # Build many distinct correlated findings and run the full investigation for
    # each; must complete well under a generous bound on ordinary hardware.
    raws = [
        _finding(id=str(i), host=f"10.0.{i // 250}.{i % 250}", port=80 + (i % 5),
                 source_tool="nmap", title=f"Service {i}",
                 evidence=f"Server: svc/{i % 20}.0")
        for i in range(1500)
    ]
    correlated = correlate_findings(raws)
    assets = correlate_assets([])
    start = time.perf_counter()
    for c in correlated[:1500]:
        v = validate_finding(c, assets)
        build_investigation(c, v, [])
    elapsed = time.perf_counter() - start
    assert elapsed < 60.0, f"investigation too slow at scale: {elapsed:.1f}s"
