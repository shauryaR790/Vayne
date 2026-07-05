"""Tests for investigation mode resolution."""

from product.backend.services.investigation_mode import resolve_investigation_mode


def test_single_file_defaults_to_combined():
    assert resolve_investigation_mode(file_count=1, prompt="analyze separately") == "combined"


def test_separate_mode_from_prompt():
    assert (
        resolve_investigation_mode(
            file_count=2,
            prompt="Analyze both files separately and give separate reports",
        )
        == "separate"
    )


def test_combined_mode_from_prompt():
    assert (
        resolve_investigation_mode(
            file_count=2,
            prompt="Correlate these scans into one investigation",
        )
        == "combined"
    )


def test_explicit_mode_overrides_prompt():
    assert (
        resolve_investigation_mode(
            file_count=2,
            prompt="analyze separately",
            explicit="combined",
        )
        == "combined"
    )
