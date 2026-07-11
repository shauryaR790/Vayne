"""Phase 2 engine tests — evidence quality, contradictions, service intelligence,
business impact, reasoning, timeline, evidence graph, intelligence hub, self-review.

These build on Phase 1 (canonical correlation + multi-dimensional confidence) and
must never regress it or the locked attack-path parity.
"""

from __future__ import annotations

from vayne.business.impact import compute_business_impact
from vayne.contradiction import build_conflicts
from vayne.correlator.engine import correlate_assets, correlate_findings
from vayne.evidence.evidence_graph import build_evidence_graph
from vayne.evidence.quality import aggregate_quality, classify_evidence
from vayne.intelligence import build_finding_intelligence
from vayne.models import Finding
from vayne.reasoning import build_confidence_timeline, build_reasoning
from vayne.service_intel import get_profile, recommendations_for
from vayne.validator.engine import validate_finding


def _finding(**kw) -> Finding:
    base = dict(id="f", host="10.0.0.5", service="", port=80, severity="medium",
                cve="", title="Finding", evidence="", source_tool="nmap")
    base.update(kw)
    return Finding(**base)


def _correlate(findings: list[Finding]):
    correlated = correlate_findings(findings)
    assets = correlate_assets([])
    return [(c, validate_finding(c, assets)) for c in correlated]


# --------------------------------------------------------------------------- #
# P4 — Evidence quality
# --------------------------------------------------------------------------- #
def test_evidence_quality_reliability_hierarchy():
    auth = classify_evidence(_finding(
        id="a", source_tool="nessus",
        title="Apache HTTP Server 2.4.49",
        evidence="Credentialed authenticated local check confirmed version 2.4.49",
    ))
    title = classify_evidence(_finding(
        id="b", source_tool="httpx", title="Login", evidence="http-title: Login Page",
    ))
    assert auth.reliability > title.reliability
    assert auth.authentication_level == "authenticated"
    assert auth.reliability_tier in ("Very High", "High")
    assert title.reliability_tier in ("Low", "Very Low")
    # Every mandated attribute is exposed.
    for key in ("confidence_quality", "reliability", "verification_strength",
                "authentication_level", "spoofability", "reproducibility",
                "freshness", "source_reputation"):
        assert key in auth.as_dict()


def test_aggregate_quality_prefers_best_and_flags_corroboration():
    findings = [
        _finding(id="1", source_tool="nmap", title="Apache httpd 2.4.49",
                 evidence="Server: Apache/2.4.49"),
        _finding(id="2", source_tool="nessus",
                 title="Apache HTTP Server", evidence="Authenticated check: Apache 2.4.49"),
    ]
    agg = aggregate_quality(findings)
    assert agg.authenticated is True
    assert agg.best_reliability >= 0.8
    assert agg.reproducible is True  # 2+ sources


# --------------------------------------------------------------------------- #
# P9/P10 — Reliability dimension is a real, explainable score
# --------------------------------------------------------------------------- #
def test_reliability_dimension_populated_and_explainable():
    pairs = _correlate([
        _finding(id="1", source_tool="nessus", title="Apache HTTP Server 2.4.49",
                 evidence="Authenticated local check: Apache/2.4.49", cve="CVE-2021-41773"),
    ])
    _, v = pairs[0]
    assert "reliability" in v.confidence_dimensions
    rel_factors = v.confidence_factors.get("reliability")
    assert rel_factors
    assert max(0, min(100, sum(f["delta"] for f in rel_factors))) == v.reliability_confidence


def test_low_quality_evidence_scores_below_authenticated():
    high = _correlate([
        _finding(id="1", source_tool="nessus", title="Apache HTTP Server 2.4.49",
                 evidence="Authenticated local check: Apache/2.4.49"),
    ])[0][1]
    low = _correlate([
        _finding(id="2", host="10.0.0.6", source_tool="httpx", title="Page",
                 evidence="http-title: Welcome", service="http"),
    ])[0][1]
    assert high.reliability_confidence > low.reliability_confidence


# --------------------------------------------------------------------------- #
# P6 — Contradiction engine
# --------------------------------------------------------------------------- #
def test_version_conflict_is_first_class():
    pairs = _correlate([
        _finding(id="1", source_tool="nmap", title="Apache httpd 2.4.54",
                 evidence="Server: Apache/2.4.54"),
        _finding(id="2", source_tool="openvas", title="Apache HTTP Server 2.4.49",
                 evidence="Apache/2.4.49 detected"),
    ])
    c, _ = pairs[0]
    conflicts = build_conflicts(c)
    version_conflicts = [x for x in conflicts if x.kind == "version"]
    assert version_conflicts
    conflict = version_conflicts[0]
    assert conflict.confidence_impact < 0
    assert conflict.severity in ("low", "medium", "high")
    assert conflict.suggested_action
    assert conflict.likely_causes


def test_reachability_conflict_detected():
    pairs = _correlate([
        _finding(id="1", source_tool="nmap", title="Service", evidence="host up, port open"),
        _finding(id="2", source_tool="nessus", title="Service",
                 evidence="host unreachable, no response"),
    ])
    c, _ = pairs[0]
    conflicts = build_conflicts(c)
    kinds = {x.kind for x in conflicts}
    assert "reachability" in kinds


# --------------------------------------------------------------------------- #
# P7/P8 — Service intelligence + recommendations
# --------------------------------------------------------------------------- #
def test_service_profiles_differ_by_service():
    apache = _correlate([_finding(id="1", source_tool="nmap",
                                  title="Apache httpd 2.4.49", evidence="Server: Apache/2.4.49")])[0][0]
    ssh = _correlate([_finding(id="2", host="10.0.0.7", source_tool="nmap", port=22,
                               title="OpenSSH 8.2", service="ssh",
                               evidence="SSH-2.0-OpenSSH_8.2")])[0][0]
    pa = get_profile(apache)
    ps = get_profile(ssh)
    assert pa.key != ps.key
    assert pa.typical_attack_surface != ps.typical_attack_surface


def test_recommendations_are_service_specific_and_gap_driven():
    pairs = _correlate([_finding(id="1", source_tool="nmap", port=8080,
                                 title="Jenkins", service="http",
                                 evidence="Jenkins dashboard detected")])
    c, v = pairs[0]
    recs = recommendations_for(c, v)
    assert recs
    assert all(r["evidence_gap"] for r in recs)
    text = " ".join(r["action"].lower() for r in recs)
    assert "jenkins" in text or "script console" in text or "plugin" in text or "anonymous" in text


# --------------------------------------------------------------------------- #
# P13 — Business impact is dynamic
# --------------------------------------------------------------------------- #
def test_business_impact_varies_by_finding():
    pairs = _correlate([
        _finding(id="1", source_tool="nmap", title="Apache httpd 2.4.49",
                 evidence="Server: Apache/2.4.49 public internet", cve="CVE-2021-41773"),
        _finding(id="2", host="10.0.0.9", source_tool="nmap", port=79,
                 title="finger", severity="info", evidence="finger service"),
    ])
    scores = []
    for c, v in pairs:
        bi = compute_business_impact(c, v, get_profile(c), [])
        scores.append(bi["score"])
        assert bi["attacker_gains"]
        assert bi["potential_consequences"]
    assert len(set(scores)) > 1


# --------------------------------------------------------------------------- #
# P11/P12 — Reasoning + timeline
# --------------------------------------------------------------------------- #
def test_reasoning_is_analyst_notebook_not_generic():
    pairs = _correlate([_finding(id="1", source_tool="nmap", title="Apache httpd 2.4.49",
                                 evidence="Server: Apache/2.4.49")])
    c, v = pairs[0]
    lines = build_reasoning(c, v, get_profile(c), aggregate_quality(c.findings), [])
    assert lines
    joined = " ".join(lines).lower()
    assert "apache" in joined
    # Not the banned terse output.
    assert lines != ["Host alive", "Version found"]
    assert any(len(l) > 40 for l in lines)


def test_confidence_timeline_shows_evolution():
    pairs = _correlate([
        _finding(id="1", source_tool="nmap", title="Apache httpd 2.4.49",
                 evidence="Server: Apache/2.4.49"),
        _finding(id="2", source_tool="openvas", title="Apache HTTP Server 2.4.49",
                 evidence="Apache/2.4.49"),
    ])
    c, v = pairs[0]
    steps = build_confidence_timeline(c, v)
    assert len(steps) >= 2
    assert all("confidence" in s and "event" in s for s in steps)


# --------------------------------------------------------------------------- #
# P5 — Typed evidence graph reconstructs findings
# --------------------------------------------------------------------------- #
def test_evidence_graph_reconstructs_finding_chain():
    pairs = _correlate([_finding(id="1", source_tool="nmap", title="Apache httpd 2.4.49",
                                 evidence="Server: Apache/2.4.49", cve="CVE-2021-41773")])
    graph = build_evidence_graph(pairs)
    c = pairs[0][0]
    chain = graph.reconstruct(c.id)
    types = [n["type"] for n in chain]
    assert "host" in types
    assert "service" in types
    assert "finding" in types
    data = graph.as_dict()
    assert data["stats"]["node_count"] > 0
    assert data["stats"]["edge_count"] > 0


# --------------------------------------------------------------------------- #
# P14/P15 — Intelligence hub bundle + self review
# --------------------------------------------------------------------------- #
def test_intelligence_bundle_complete_and_self_reviewed():
    pairs = _correlate([_finding(id="1", source_tool="nessus",
                                 title="Apache HTTP Server 2.4.49",
                                 evidence="Authenticated local check: Apache/2.4.49",
                                 cve="CVE-2021-41773")])
    c, v = pairs[0]
    bundle = build_finding_intelligence(c, v, [])
    for key in ("facts", "confidence", "evidence_quality", "conflicts",
                "service_profile", "recommendations", "business_impact",
                "reasoning", "timeline", "self_review"):
        assert key in bundle
    assert bundle["self_review"]["complete"] is True


def test_intelligence_is_deterministic():
    findings = [_finding(id="1", source_tool="nmap", title="Apache httpd 2.4.49",
                         evidence="Server: Apache/2.4.49", cve="CVE-2021-41773")]
    a = _correlate(findings)
    b = _correlate([f.model_copy() for f in findings])
    ia = build_finding_intelligence(a[0][0], a[0][1], [])
    ib = build_finding_intelligence(b[0][0], b[0][1], [])
    assert ia["confidence"] == ib["confidence"]
    assert ia["business_impact"]["score"] == ib["business_impact"]["score"]
    assert ia["reasoning"] == ib["reasoning"]
