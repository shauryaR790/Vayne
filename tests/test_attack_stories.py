"""Phase I — deterministic attack story tests."""

from __future__ import annotations

import pytest

from vayne.production.attack_story import generate_attack_story
from tests._production_fixtures import run_metasploit_export


@pytest.fixture
def exported(tmp_path):
    return run_metasploit_export(tmp_path)


def test_attack_story_fields_present(exported):
    report, _ = exported
    for path in report.attack_paths:
        story = path.attack_story
        for key in (
            "initial_foothold",
            "exploitation_step",
            "privilege_gained",
            "lateral_movement",
            "target_reached",
            "business_impact",
            "narrative",
        ):
            assert key in story
        assert story["narrative"]
        assert "UNKNOWN" not in story["narrative"].upper() or "insufficient" not in story["narrative"].lower()


def test_vsftpd_story_mentions_cve_and_host(exported):
    report, _ = exported
    vsftpd = next(
        (p for p in report.attack_paths if "vsftpd" in p.title.lower()),
        None,
    )
    assert vsftpd is not None
    story = vsftpd.attack_story
    assert "CVE-2011-2523" in story["narrative"] or "CVE-2011-2523" in story["exploitation_step"]
    assert "192.168.56.101" in story["narrative"] or "192.168.56.101" in story["target_reached"]


def test_attack_story_deterministic(tmp_path):
    report1, _ = run_metasploit_export(tmp_path / "a")
    report2, _ = run_metasploit_export(tmp_path / "b")
    s1 = [p.attack_story for p in report1.attack_paths]
    s2 = [p.attack_story for p in report2.attack_paths]
    assert s1 == s2
