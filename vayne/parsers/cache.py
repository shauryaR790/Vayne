"""Incremental parse cache — skip unchanged scan files by content hash."""

from __future__ import annotations

import hashlib
import json
import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

from vayne.models import Asset, Finding

logger = logging.getLogger(__name__)

_lock_guard = threading.Lock()
_digest_locks: dict[str, threading.Lock] = {}


def file_content_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _cache_path(cache_dir: Path, digest: str) -> Path:
    return cache_dir / "files" / f"{digest}.json"


def _lock_for(digest: str) -> threading.Lock:
    with _lock_guard:
        lock = _digest_locks.get(digest)
        if lock is None:
            lock = threading.Lock()
            _digest_locks[digest] = lock
        return lock


def _read_cache_payload(target: Path) -> dict[str, Any] | None:
    try:
        raw = target.read_text(encoding="utf-8").strip()
        if not raw:
            raise ValueError("empty cache file")
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("cache payload is not an object")
        return payload
    except (json.JSONDecodeError, ValueError, OSError) as exc:
        logger.warning("Ignoring corrupt parse cache %s: %s", target.name, exc)
        try:
            target.unlink(missing_ok=True)
        except OSError:
            pass
        return None


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
    """Return (findings, assets, from_cache). Never raises on cache corruption."""
    if path.stat().st_size == 0:
        return [], [], False

    if not cache_dir:
        findings, assets = parse_fn(path)
        stamped = _stamp(path, findings, assets)
        return stamped[0], stamped[1], False

    cache_dir.mkdir(parents=True, exist_ok=True)
    digest = file_content_hash(path)
    target = _cache_path(cache_dir, digest)

    with _lock_for(digest):
        if target.exists():
            payload = _read_cache_payload(target)
            if payload is not None:
                findings = [Finding.model_validate(f) for f in payload.get("findings") or []]
                assets = [Asset.model_validate(a) for a in payload.get("assets") or []]
                stamped = _stamp(path, findings, assets)
                return stamped[0], stamped[1], True

        findings, assets = parse_fn(path)
        findings, assets = _stamp(path, findings, assets)
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(".json.tmp")
        tmp.write_text(
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
        tmp.replace(target)
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
    skipped = sum(1 for e in entries if e.get("skipped"))
    return {
        "files": entries,
        "cache_hits": cache_hits,
        "cache_misses": cache_misses,
        "skipped": skipped,
        "incremental": cache_hits > 0,
    }


def compute_input_fingerprint(file_hashes: list[str]) -> str:
    """Stable fingerprint of uploaded inputs (sorted content hashes)."""
    payload = "|".join(sorted(h for h in file_hashes if h))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
