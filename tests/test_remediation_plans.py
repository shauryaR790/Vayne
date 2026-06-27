"""Phase I — remediation plan tests."""

from __future__ import annotations

import json

import pytest

from tests._production_fixtures import run_metasploit_export


@pytest.fixture
def remediation(tmp_path):
    _, export_dir = run_metasploit_export(tmp_path)
    return json.loads((export_dir / "remediation_plan.json").read_text(encoding="utf-8"))


def test_remediation_items_have_required_fields(remediation):
    assert remediation["items"]
    for item in remediation["items"]:
        for key in ("fix", "difficulty", "expected_risk_reduction", "expected_confidence_reduction", "affected_attack_paths"):
            assert key in item


def test_vsftpd_remediation_present(remediation):
    fixes = " ".join(i["fix"].lower() for i in remediation["items"])
    assert "vsftpd" in fixes or "upgrade" in fixes or "disable" in fixes
