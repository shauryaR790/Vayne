"""Tests for investigation deduplication key."""

from __future__ import annotations

from product.backend.services.investigation_key import (
    build_investigation_summary,
    compact_investigation_name,
    compute_investigation_key,
    normalize_source_filename,
)


def test_investigation_key_is_stable():
    findings = [{"id": "f1", "title": "Apache RCE"}]
    paths = [{"stable_id": "p1", "confidence": 92, "risk": 8.6}]
    a = compute_investigation_key("firstrun.xml", findings, paths, 72)
    b = compute_investigation_key("firstrun.xml", findings, paths, 72)
    assert a == b
    assert len(a) == 64


def test_investigation_key_changes_when_findings_change():
    paths = [{"stable_id": "p1"}]
    a = compute_investigation_key(
        "firstrun.xml",
        [{"title": "Apache RCE", "host": "10.0.0.1"}],
        paths,
        72,
    )
    b = compute_investigation_key(
        "firstrun.xml",
        [{"title": "SMB exposure", "host": "10.0.0.1"}],
        paths,
        72,
    )
    assert a != b


def test_investigation_key_normalizes_filename_order():
    findings: list = []
    paths: list = []
    a = compute_investigation_key("b.xml,a.xml", findings, paths, 10)
    b = compute_investigation_key("a.xml,b.xml", findings, paths, 10)
    assert a == b
    assert normalize_source_filename("B.XML,A.XML") == "a.xml,b.xml"


def test_build_investigation_summary_prefers_attack_path():
    summary = build_investigation_summary(
        [],
        [{"attack_story": {"narrative": "Internet-facing Apache RCE identified"}}],
    )
    assert "Apache RCE" in summary


def test_compact_investigation_name_for_many_files():
    names = [f"scan_{i}.xml" for i in range(40)]
    label = compact_investigation_name("web-investigation", filenames=names)
    assert len(label) <= 200
    assert "40" in label or "39 more" in label
    assert "scan_0.xml" in label
