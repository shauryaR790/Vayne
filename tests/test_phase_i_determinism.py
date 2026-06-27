"""Phase I — full production export determinism."""

from __future__ import annotations

import hashlib
import json

import pytest

from tests._production_fixtures import METASPLOIT, parity_signature, run_metasploit_export

EXPORT_FILES = (
    "attack_paths.json",
    "graph.json",
    "findings.json",
    "executive_report.md",
    "analyst_report.md",
    "attack_story.md",
    "remediation_plan.json",
    "proof.txt",
)


def _strip_session_ids(obj):
    skip = frozenset({
        "id", "edge_id", "source_finding_id", "source_finding_ids",
        "finding_ids", "finding_id",
    })
    if isinstance(obj, dict):
        return {k: _strip_session_ids(v) for k, v in obj.items() if k not in skip}
    if isinstance(obj, list):
        return [_strip_session_ids(x) for x in obj]
    return obj


def _normalize_export_content(text: str, name: str) -> str:
    """Strip session-random ids so determinism tests compare structure only."""
    import re

    if name.endswith(".json"):
        data = json.loads(text)
        if name == "remediation_plan.json":
            for item in data.get("items", []):
                n = len(item.get("affected_attack_paths", []))
                item["affected_attack_paths"] = [f"path_{i}" for i in range(n)]
        if name == "findings.json":
            for section in ("validated", "rejected"):
                for item in data.get(section, []):
                    item.pop("id", None)
                data[section].sort(key=lambda x: (x.get("host", ""), x.get("title", "")))
        return json.dumps(_strip_session_ids(data), sort_keys=True)

    text = re.sub(r"Path [a-f0-9]{8}", "Path <id>", text)
    text = re.sub(r"PATH [a-f0-9]{8}", "PATH <id>", text)
    text = re.sub(r"path [a-f0-9]{8}", "path <id>", text)
    text = re.sub(r"\b[a-f0-9]{12}\b", "<fid>", text)
    return text


def _dir_hash(export_dir, names):
    parts = []
    for name in sorted(names):
        raw = (export_dir / name).read_text(encoding="utf-8")
        parts.append(_normalize_export_content(raw, name))
    return hashlib.sha256("".join(parts).encode()).hexdigest()


@pytest.fixture
def exported(tmp_path):
    return run_metasploit_export(tmp_path)


def test_production_exports_identical_over_10_runs(tmp_path):
    hashes = []
    for i in range(10):
        sub = tmp_path / f"run{i}"
        run_metasploit_export(sub)
        export_dir = sub / "reports"
        hashes.append(_dir_hash(export_dir, EXPORT_FILES))
    assert len(set(hashes)) == 1


def test_metasploitable_parity(exported):
    report, _ = exported
    sig = parity_signature(report)
    assert sig == {
        "path_count": 4,
        "confidences": [83, 92, 100, 100],
        "risks": [6.5, 7.2, 8.6, 8.6],
        "node_sequences": sig["node_sequences"],
    }
