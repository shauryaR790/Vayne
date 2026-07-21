"""Incremental parse cache — skip unchanged scan files by content hash."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

from vayne.models import Asset, Finding


def file_content_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _cache_path(cache_dir: Path, digest: str) -> Path:
    return cache_dir / "files" / f"{digest}.json"


@dataclass
class ScanLoadResult:
    """Parse output with optional incremental manifest (unpacks as findings, assets)."""

    findings: list[Finding]
    assets: list[Asset]
    manifest: dict[str, Any]

    def __iter__(self) -> Iterator[list]:
        yield self.findings
        yield self.assets


@dataclass
class ParseCacheResult:
    findings: list[Finding]
    assets: list[Asset]
    cache_hits: int = 0
    cache_misses: int = 0
    manifest: list[dict[str, Any]] | None = None


def load_cached_parse(
    path: Path,
    cache_dir: Path | None,
    *,
    parse_fn,
) -> tuple[list[Finding], list[Asset], bool]:
    """Return (findings, assets, from_cache)."""
    if not cache_dir:
        findings, assets = parse_fn(path)
        stamped = _stamp(path, findings, assets)
        return stamped[0], stamped[1], False

    cache_dir.mkdir(parents=True, exist_ok=True)
    digest = file_content_hash(path)
    target = _cache_path(cache_dir, digest)
    if target.exists():
        payload = json.loads(target.read_text(encoding="utf-8"))
        findings = [Finding.model_validate(f) for f in payload.get("findings") or []]
        assets = [Asset.model_validate(a) for a in payload.get("assets") or []]
        stamped = _stamp(path, findings, assets)
        return stamped[0], stamped[1], True

    findings, assets = parse_fn(path)
    findings, assets = _stamp(path, findings, assets)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(
            {
                "source_file": path.name,
                "content_hash": digest,
                "findings": [f.model_dump(mode="json") for f in findings],
                "assets": [a.model_dump(mode="json") for a in assets],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return findings, assets, False


def _stamp(path: Path, findings: list[Finding], assets: list[Asset]) -> tuple[list[Finding], list[Asset]]:
    name = path.name
    stamped_findings: list[Finding] = []
    for f in findings:
        if f.source_file:
            stamped_findings.append(f)
        else:
            stamped_findings.append(f.model_copy(update={"source_file": name}))
    stamped_assets: list[Asset] = []
    for a in assets:
        if a.source_file:
            stamped_assets.append(a)
        else:
            stamped_assets.append(a.model_copy(update={"source_file": name}))
    return stamped_findings, stamped_assets


def build_manifest(
    entries: list[dict[str, Any]],
    *,
    cache_hits: int,
    cache_misses: int,
) -> dict[str, Any]:
    return {
        "files": entries,
        "cache_hits": cache_hits,
        "cache_misses": cache_misses,
        "incremental": cache_hits > 0,
    }


def compute_input_fingerprint(file_hashes: list[str]) -> str:
    """Stable fingerprint of uploaded inputs (sorted content hashes)."""
    payload = "|".join(sorted(h for h in file_hashes if h))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
