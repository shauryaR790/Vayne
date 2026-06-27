"""Phase I — executive report tests."""

from __future__ import annotations

import pytest

from tests._production_fixtures import run_metasploit_export

SECTIONS = (
    "EXECUTIVE SUMMARY",
    "TOP RISKS",
    "BUSINESS IMPACT",
    "LIKELY ATTACK PATHS",
    "MOST CRITICAL ASSETS",
    "RECOMMENDED REMEDIATIONS",
    "MITRE COVERAGE",
    "ANALYST CONFIDENCE",
    "ATTACK SURFACE SCORE",
)


@pytest.fixture
def executive_md(tmp_path):
    _, export_dir = run_metasploit_export(tmp_path)
    return (export_dir / "executive_report.md").read_text(encoding="utf-8")


def test_executive_report_sections(executive_md):
    for section in SECTIONS:
        assert section in executive_md


def test_executive_summary_mentions_path_count(executive_md):
    assert "4" in executive_md
    assert "attack path" in executive_md.lower()


def test_attack_surface_score_in_executive(executive_md):
    assert "ATTACK SURFACE SCORE" in executive_md
    assert "/100" in executive_md or "score" in executive_md.lower()
