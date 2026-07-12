"""Phase 3 tests — the autonomous investigator.

Builds on Phase 1/2 (must not regress them or attack-path parity). Verifies the
engine reasons like a senior pen-tester: staged pipeline, competing hypotheses,
self-challenge, confidence evolution, attack story, investigation tasks, notebook,
multi-dimensional investigation confidence, and rejected-path reasoning.
"""

from __future__ import annotations

from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.investigation import build_investigation
from vayne.investigation.evidence_primitives import primitives_for
from vayne.investigation.hypotheses import build_hypotheses
from vayne.investigation.self_challenge import run_self_challenge
from vayne.models import Finding
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
# P4 — evidence primitives, not scanner names
# --------------------------------------------------------------------------- #
def test_evidence_primitives_replace_scanner_thinking():
    c, _ = _one([_finding(id="1", source_tool="nmap", port=443,
                          title="Apache httpd 2.4.49",
                          evidence="Server: Apache/2.4.49; TLS handshake; http-title: Home")])
    prims = primitives_for(c)
    types = {p["type"] for p in prims}
    assert {"version"} <= types
    assert types & {"tcp_syn", "banner", "tls", "http_response"}
    # Scanner name is metadata only, evidence type is first-class.
    assert all("source_tool" in p for p in prims)


# --------------------------------------------------------------------------- #
# P2 — hypotheses with probabilities summing to 100
# --------------------------------------------------------------------------- #
def test_hypotheses_are_multiple_and_normalized():
    c, v = _one([_finding(id="1", source_tool="nmap", title="Apache httpd 2.4.49",
                          evidence="Server: Apache/2.4.49", cve="CVE-2021-41773")])
    hyps = build_hypotheses(c, v)
    assert len(hyps) >= 3
    assert sum(h["probability"] for h in hyps) == 100
    cats = {h["category"] for h in hyps}
    assert {"primary", "alternative", "false_positive"} <= cats
    assert hyps[0]["probability"] >= hyps[-1]["probability"]


def test_authenticated_evidence_shrinks_false_positive_hypothesis():
    weak = _one([_finding(id="1", host="10.0.0.9", source_tool="httpx", service="http",
                          title="Page", evidence="http-title: Welcome")])
    strong = _one([_finding(id="2", source_tool="nessus", title="Apache HTTP Server 2.4.49",
                            evidence="Authenticated local check confirmed Apache/2.4.49")])
    fp_weak = [h for h in build_hypotheses(*weak) if h["category"] == "false_positive"][0]
    fp_strong = [h for h in build_hypotheses(*strong) if h["category"] == "false_positive"][0]
    assert fp_strong["probability"] < fp_weak["probability"]


# --------------------------------------------------------------------------- #
# P12 — self challenge
# --------------------------------------------------------------------------- #
def test_self_challenge_lowers_confidence_and_lists_overturners():
    c, v = _one([_finding(id="1", host="10.0.0.9", source_tool="httpx", service="http",
                          title="Login", evidence="http-title: Login; Server: Apache")])
    sc = run_self_challenge(c, v)
    assert sc["challenges"]
    assert sc["net_confidence_effect"] <= 0
    assert sc["what_would_overturn"]
    # An unresolved investigation is retained as observed, not validated.
    assert "observed exposure" in sc["verdict"] or "survives" in sc["verdict"]


# --------------------------------------------------------------------------- #
# P1/P3/P5/P13 — full investigation
# --------------------------------------------------------------------------- #
def test_investigation_has_all_stages_in_order():
    c, v = _one([_finding(id="1", source_tool="nmap", title="Apache httpd 2.4.49",
                          evidence="Server: Apache/2.4.49", cve="CVE-2021-41773")])
    inv = build_investigation(c, v, [])
    stage_names = [s["stage"] for s in inv["stages"]]
    assert stage_names == [
        "Evidence Collected", "Observation", "Hypothesis Created",
        "Alternative Explanations", "Evidence Validation", "Confidence Updated",
        "Conclusion", "Recommendation",
    ]


def test_investigation_exposes_independent_confidence_dimensions():
    c, v = _one([_finding(id="1", source_tool="nmap", title="Apache httpd 2.4.49",
                          evidence="Server: Apache/2.4.49", cve="CVE-2021-41773")])
    dims = build_investigation(c, v, [])["investigation_confidence"]
    for key in ("observation", "evidence_reliability", "exploitability",
                "business_impact", "attack_path", "overall_investigation"):
        assert key in dims
        assert "score" in dims[key] and "reasoning" in dims[key] and dims[key]["reasoning"]


def test_confidence_evolution_and_notebook_present():
    c, v = _one([
        _finding(id="1", source_tool="nmap", title="Apache httpd 2.4.49", evidence="Server: Apache/2.4.49"),
        _finding(id="2", source_tool="openvas", title="Apache HTTP Server 2.4.49", evidence="Apache/2.4.49"),
    ])
    inv = build_investigation(c, v, [])
    assert len(inv["confidence_evolution"]) >= 2
    notebook = inv["notebook"]
    assert notebook
    assert all("time" in n and "event" in n for n in notebook)
    # Timestamps are monotonic (deterministic synthetic clock).
    times = [n["time"] for n in notebook]
    assert times == sorted(times)


def test_attack_story_is_service_specific():
    apache = _one([_finding(id="1", source_tool="nmap", title="Apache httpd 2.4.49",
                            evidence="Server: Apache/2.4.49")])
    ssh = _one([_finding(id="2", host="10.0.0.7", port=22, source_tool="nmap",
                         service="ssh", title="OpenSSH 8.2", evidence="SSH-2.0-OpenSSH_8.2")])
    a_steps = [s["action"] for s in build_investigation(*apache, [])["attack_story"]["steps"]]
    s_steps = [s["action"] for s in build_investigation(*ssh, [])["attack_story"]["steps"]]
    assert a_steps != s_steps


def test_investigation_tasks_are_multi_step_with_expected_gain():
    c, v = _one([_finding(id="1", source_tool="nmap", title="Apache httpd 2.4.49",
                          evidence="Server: Apache/2.4.49", cve="CVE-2021-41773")])
    tasks = build_investigation(c, v, [])["investigation_tasks"]
    assert tasks
    for t in tasks:
        assert len(t["steps"]) >= 2
        assert t["expected_confidence_increase"] >= 0
        assert t["targets_dimension"]


def test_conclusion_is_human_level_and_evidence_derived():
    c, v = _one([_finding(id="1", source_tool="nmap", title="Apache httpd 2.4.49",
                          evidence="Server: Apache/2.4.49", cve="CVE-2021-41773")])
    conclusion = build_investigation(c, v, [])["conclusion"]
    assert "Apache" in conclusion
    assert "CVE-2021-41773" in conclusion
    assert conclusion != "Apache detected."


def test_investigation_is_deterministic():
    findings = [_finding(id="1", source_tool="nmap", title="Apache httpd 2.4.49",
                         evidence="Server: Apache/2.4.49", cve="CVE-2021-41773")]
    a = _one([f.model_copy() for f in findings])
    b = _one([f.model_copy() for f in findings])
    ia = build_investigation(*a, [])
    ib = build_investigation(*b, [])

    def _strip_ids(hyps):
        return [{k: v for k, v in h.items() if k != "id"} for h in hyps]

    # Content is deterministic; only the correlated-finding id (embedded in
    # hypothesis ids) varies across independent correlation runs.
    assert _strip_ids(ia["hypotheses"]) == _strip_ids(ib["hypotheses"])
    assert ia["notebook"] == ib["notebook"]
    assert ia["conclusion"] == ib["conclusion"]
    assert ia["investigation_confidence"] == ib["investigation_confidence"]
