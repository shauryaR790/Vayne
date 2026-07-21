"""Parse scan files and directories into Finding + Asset lists."""

from __future__ import annotations

import json
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from vayne.models import Asset, Finding
from vayne.parsers import (
    burp,
    generic,
    httpx,
    katana,
    naabu,
    nessus,
    nmap,
    nuclei,
    openvas,
    qualys,
    rapid7,
    sarif,
)
from vayne.parsers.cache import ScanLoadResult, build_manifest, file_content_hash, load_cached_parse

PARSER_BY_HINT = {
    "nuclei": nuclei.parse,
    "nmap": nmap.parse,
    "burp": burp.parse,
    "nessus": nessus.parse,
    "openvas": openvas.parse,
    "httpx": httpx.parse,
    "naabu": naabu.parse,
    "katana": katana.parse,
    "qualys": qualys.parse,
    "rapid7": rapid7.parse,
    "nexpose": rapid7.parse,
    "insightvm": rapid7.parse,
    "sarif": sarif.parse,
    "prowler": generic.parse_json,
    "scoutsuite": generic.parse_json,
}

PARALLEL_THRESHOLD = 8
MAX_PARSE_WORKERS = 8


def _uid() -> str:
    return uuid.uuid4().hex[:12]


SKIP_FILE_NAMES = ("evidence_manifest.json",)


def parse_file(path: Path) -> tuple[list[Finding], list[Asset]]:
    if path.name.lower() in SKIP_FILE_NAMES:
        return [], []
    name = path.name.lower()
    parser = _resolve_parser(path, name)
    findings, assets = parser(path)
    return _stamp_source(path, findings, assets)


def _stamp_source(
    path: Path, findings: list[Finding], assets: list[Asset]
) -> tuple[list[Finding], list[Asset]]:
    name = path.name
    out_f = [
        f if f.source_file else f.model_copy(update={"source_file": name}) for f in findings
    ]
    out_a = [
        a if a.source_file else a.model_copy(update={"source_file": name}) for a in assets
    ]
    return out_f, out_a


def _resolve_parser(path: Path, name: str):
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return lambda p: _auto_csv(p)
    if suffix == ".sarif":
        return sarif.parse
    for hint, fn in PARSER_BY_HINT.items():
        if hint in name:
            return fn
    if suffix == ".json":
        return lambda p: _auto_json(p)
    if suffix in (".xml", ".html", ".htm"):
        return lambda p: _auto_xml(p)
    if suffix == ".txt":
        return lambda p: _auto_text(p)
    raise ValueError(f"Cannot determine parser for: {path}")


def _auto_text(path: Path) -> tuple[list[Finding], list[Asset]]:
    head = path.read_text(encoding="utf-8", errors="replace")[:1200].lower()
    if head.lstrip().startswith("{") or head.lstrip().startswith("["):
        return _auto_json(path)
    if "<" in head and ">" in head:
        return _auto_xml(path)
    if "," in head and "\n" in head:
        return _auto_csv(path)
    raise ValueError(f"Cannot determine parser for text file: {path.name}")


def _auto_json(path: Path) -> tuple[list[Finding], list[Asset]]:
    text = path.read_text(encoding="utf-8", errors="replace").strip()
    if not text:
        return [], []
    data = json.loads(text)
    if isinstance(data, dict) and isinstance(data.get("runs"), list):
        return sarif.parse(path)
    if isinstance(data, list) and data:
        sample = data[0]
        if isinstance(sample, dict):
            if "template-id" in sample or "templateID" in sample:
                return nuclei.parse(path)
            if "url" in sample and ("status-code" in sample or "status_code" in sample):
                return httpx.parse(path)
            if "port" in sample and "ip" in sample:
                return naabu.parse(path)
            if "request" in sample and "endpoint" in sample:
                return katana.parse(path)
    return generic.parse_json(path)


def _auto_xml(path: Path) -> tuple[list[Finding], list[Asset]]:
    head = path.read_text(encoding="utf-8", errors="replace")[:1200].lower()
    if "nmaprun" in head:
        return nmap.parse(path)
    if "nessusclientdata" in head or "reportitem" in head:
        return nessus.parse(path)
    if "nexposereport" in head or "<nodes" in head or "vulnerabilitydefinition" in head:
        return rapid7.parse(path)
    if "asset_data_report" in head or "qualys" in head or "<host_list" in head or "<qid" in head:
        return qualys.parse(path)
    if "issues" in head:
        return burp.parse(path)
    if "report" in head and ("nvt" in head or "result" in head):
        return openvas.parse(path)
    return nessus.parse(path)


def _auto_csv(path: Path) -> tuple[list[Finding], list[Asset]]:
    head = path.read_text(encoding="utf-8", errors="replace")[:1500].lower()
    if "qid" in head or "qualys" in head:
        return qualys.parse(path)
    if "plugin id" in head or "plugin output" in head:
        return generic.parse_csv(path, tool="nessus")
    return generic.parse_csv(path)


def _collect_files(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for p in paths:
        if p.is_dir():
            for ext in ("*.json", "*.xml", "*.csv", "*.sarif", "*.html", "*.htm", "*.txt", "*.nessus"):
                files.extend(sorted(p.rglob(ext)))
        elif p.is_file():
            files.append(p)
        else:
            raise FileNotFoundError(str(p))
    return [f for f in files if f.name.lower() not in SKIP_FILE_NAMES]


def _parse_one(path: Path, cache_dir: Path | None) -> tuple[list[Finding], list[Asset], dict]:
    if path.stat().st_size == 0:
        return [], [], {
            "file": path.name,
            "content_hash": "",
            "from_cache": False,
            "findings": 0,
            "assets": 0,
            "skipped": True,
            "error": "Empty file",
        }
    try:
        digest = file_content_hash(path)
        findings, assets, from_cache = load_cached_parse(path, cache_dir, parse_fn=parse_file)
        return findings, assets, {
            "file": path.name,
            "content_hash": digest,
            "from_cache": from_cache,
            "findings": len(findings),
            "assets": len(assets),
        }
    except Exception as exc:
        return [], [], {
            "file": path.name,
            "content_hash": "",
            "from_cache": False,
            "findings": 0,
            "assets": 0,
            "skipped": True,
            "error": str(exc)[:240],
        }


def load_scan_files(
    paths: list[Path],
    *,
    cache_dir: Path | None = None,
) -> ScanLoadResult:
    """Load and parse scan files. Unpacks as (findings, assets) for compatibility."""
    files = _collect_files(paths)
    if not files:
        raise ValueError("No scan files found")

    findings: list[Finding] = []
    assets: list[Asset] = []
    manifest_entries: list[dict] = []
    cache_hits = 0
    cache_misses = 0

    if len(files) >= PARALLEL_THRESHOLD:
        with ThreadPoolExecutor(max_workers=min(MAX_PARSE_WORKERS, len(files))) as pool:
            futures = {pool.submit(_parse_one, f, cache_dir): f for f in files}
            for fut in as_completed(futures):
                fnds, asts, meta = fut.result()
                findings.extend(fnds)
                assets.extend(asts)
                manifest_entries.append(meta)
                if meta["from_cache"]:
                    cache_hits += 1
                else:
                    cache_misses += 1
    else:
        for f in files:
            fnds, asts, meta = _parse_one(f, cache_dir)
            findings.extend(fnds)
            assets.extend(asts)
            manifest_entries.append(meta)
            if meta["from_cache"]:
                cache_hits += 1
            else:
                cache_misses += 1

    manifest = build_manifest(
        sorted(manifest_entries, key=lambda e: e["file"]),
        cache_hits=cache_hits,
        cache_misses=cache_misses,
    )
    return ScanLoadResult(findings=findings, assets=assets, manifest=manifest)


def load_scan_directory(path: Path, *, cache_dir: Path | None = None) -> ScanLoadResult:
    return load_scan_files([path], cache_dir=cache_dir)
