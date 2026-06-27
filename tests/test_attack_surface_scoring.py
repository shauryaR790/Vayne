"""Phase I — attack surface scoring tests."""

from __future__ import annotations

import pytest

from vayne.production.attack_surface import classify_surface, compute_attack_surface_score
from tests._production_fixtures import parity_signature, run_metasploit_export


@pytest.fixture
def exported(tmp_path):
    return run_metasploit_export(tmp_path)


def test_attack_surface_score_range(exported):
    report, _ = exported
    score, label, proof = compute_attack_surface_score(report)
    assert 0 <= score <= 100
    assert label == classify_surface(score)
    assert proof["factors"]


def test_metasploitable_surface_not_minimal(exported):
    report, _ = exported
    score, label, _ = compute_attack_surface_score(report)
    assert score > 40
    assert label in ("Moderate", "High", "Critical")


def test_surface_scoring_deterministic(exported):
    report, _ = exported
    a = compute_attack_surface_score(report)
    b = compute_attack_surface_score(report)
    assert a == b


def test_parity_unchanged_by_surface(exported):
    report, _ = exported
    sig = parity_signature(report)
    assert sig["path_count"] == 4
    assert sig["confidences"] == [83, 92, 100, 100]
    assert sig["risks"] == [6.5, 7.2, 8.6, 8.6]
