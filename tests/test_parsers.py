"""Parser tests."""

from pathlib import Path

from vayne.parsers.loader import load_scan_files, parse_file

EXAMPLES = Path(__file__).parent.parent / "examples" / "scan_results"


def test_nuclei_parser():
    findings, assets = parse_file(EXAMPLES / "nuclei.json")
    assert len(findings) >= 3
    assert findings[0].source_tool == "nuclei"


def test_nmap_parser():
    findings, _ = parse_file(EXAMPLES / "nmap.xml")
    assert any("Apache" in (f.title + f.evidence) for f in findings)


def test_httpx_parser():
    findings, assets = parse_file(EXAMPLES / "httpx.json")
    assert any(f.source_tool == "httpx" for f in findings)
    assert len(assets) >= 1


def test_naabu_parser():
    findings, _ = parse_file(EXAMPLES / "naabu.json")
    assert all(f.port for f in findings)


def test_katana_parser():
    findings, _ = parse_file(EXAMPLES / "katana.json")
    assert len(findings) >= 2


def test_nessus_xml_parser():
    findings, _ = parse_file(EXAMPLES / "nessus.nessus")
    assert any("Apache" in f.title for f in findings)


def test_load_directory():
    findings, assets = load_scan_files([EXAMPLES])
    assert len(findings) >= 10
    assert len(assets) >= 2
