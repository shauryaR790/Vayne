"""Phase I — analyst report tests."""

from __future__ import annotations

import pytest

from tests._production_fixtures import run_metasploit_export

SECTIONS = (
    "GRAPH STATISTICS",
    "CONFIDENCE PROOFS",
    "RISK PROOFS",
    "REJECTED PATHS",
    "MITRE MAPPINGS",
    "EVIDENCE CHAINS",
    "CAPABILITY CHAINS",
    "ATTACK CATEGORY PROOFS",
    "BLAST RADIUS",
    "REMEDIATION RATIONALE",
)


@pytest.fixture
def analyst_md(tmp_path):
    _, export_dir = run_metasploit_export(tmp_path)
    return (export_dir / "analyst_report.md").read_text(encoding="utf-8")


def test_analyst_report_sections(analyst_md):
    for section in SECTIONS:
        assert section in analyst_md


def test_analyst_report_lists_paths(analyst_md):
    assert "remote_rce" in analyst_md.lower() or "REMOTE_RCE" in analyst_md
