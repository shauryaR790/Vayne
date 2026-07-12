"""Qualys VM / VMDR parser (XML scan reports and CSV exports).

Handles the two shapes analysts actually export from Qualys:

* XML VM reports — ``<HOST><VULNS><VULN>`` (or ``<DETECTION>``) under ``<HOST_LIST>``.
* CSV exports — the flat "IP, DNS, QID, Title, Severity, CVE ID, Results" grid.

Credentialed (authenticated) detections are preserved verbatim in the evidence
text so the validation loop can recognize them as verified.
"""

from __future__ import annotations

import csv
import xml.etree.ElementTree as ET
from pathlib import Path

from vayne.models import Asset, Finding
from vayne.parsers.common import extract_cve, extract_cwe, merge_asset, new_id, now, parse_port

# Qualys severity is 1..5 (5 = most severe).
_QUALYS_SEV = {"1": "info", "2": "low", "3": "medium", "4": "high", "5": "critical"}


def parse(path: Path) -> tuple[list[Finding], list[Asset]]:
    if path.suffix.lower() == ".csv":
        return _parse_csv(path)
    return _parse_xml(path)


def _parse_xml(path: Path) -> tuple[list[Finding], list[Asset]]:
    root = ET.parse(path).getroot()
    findings: list[Finding] = []
    assets: dict[str, Asset] = {}

    for host in root.iter("HOST"):
        ip = _txt(host, "IP")
        dns = _txt(host, "DNS")
        host_id = dns or ip or "unknown"
        for vuln in list(host.iter("VULN")) + list(host.iter("DETECTION")):
            qid = _txt(vuln, "QID")
            title = _txt(vuln, "TITLE") or f"Qualys QID {qid}" or "qualys-finding"
            severity = _QUALYS_SEV.get(_txt(vuln, "SEVERITY"), "info")
            results = _txt(vuln, "RESULTS")
            diagnosis = _txt(vuln, "DIAGNOSIS")
            port = parse_port(_txt(vuln, "PORT"))
            protocol = _txt(vuln, "PROTOCOL")
            cve = extract_cve(f"{title} {diagnosis} {results} {_txt(vuln, 'CVE_ID')} {_txt(vuln, 'CVE')}")
            body = " ".join(s for s in (diagnosis, results) if s)
            authed = "AUTHENTICATED" if _txt(host, "AUTHENTICATION") or "authenticated" in body.lower() else ""

            findings.append(
                Finding(
                    id=new_id(),
                    host=host_id,
                    service=protocol,
                    port=port,
                    severity=severity,
                    cve=cve,
                    cwe=extract_cwe(body),
                    title=title,
                    description=body[:400],
                    evidence=(f"{authed} {body}".strip())[:500],
                    confidence=72,
                    source_tool="qualys",
                    timestamp=now(),
                )
            )
            merge_asset(assets, host_id, ip=ip, port=port, service=protocol, tag="qualys")

    return findings, list(assets.values())


def _parse_csv(path: Path) -> tuple[list[Finding], list[Asset]]:
    findings: list[Finding] = []
    assets: dict[str, Asset] = {}
    rows = _read_csv_rows(path)
    for row in rows:
        get = _getter(row)
        ip = get("IP", "IP Address")
        dns = get("DNS", "DNS Name", "NetBIOS", "Hostname")
        host_id = dns or ip or "unknown"
        if not host_id or host_id == "unknown" and not any(row.values()):
            continue
        title = get("Title", "Vuln Title", "QID Title") or f"Qualys QID {get('QID')}"
        severity = _QUALYS_SEV.get(str(get("Severity", "Severity Level")).strip(), _word_sev(get("Severity")))
        results = get("Results", "Threat", "Impact", "Solution")
        cve = extract_cve(f"{title} {get('CVE ID', 'CVE')} {results}")
        port = parse_port(get("Port"))
        protocol = get("Protocol")

        findings.append(
            Finding(
                id=new_id(),
                host=host_id,
                service=protocol,
                port=port,
                severity=severity,
                cve=cve,
                cwe=extract_cwe(results),
                title=title or "qualys-finding",
                description=results[:400],
                evidence=results[:500],
                confidence=70,
                source_tool="qualys",
                timestamp=now(),
            )
        )
        merge_asset(assets, host_id, ip=ip, port=port, service=protocol, tag="qualys")

    return findings, list(assets.values())


def _read_csv_rows(path: Path) -> list[dict[str, str]]:
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    # Qualys CSVs carry a preamble; the real header row is the first line that
    # contains a recognizable column such as "QID" or "IP".
    start = 0
    for i, line in enumerate(lines):
        low = line.lower()
        if ("qid" in low or "ip" in low) and ("title" in low or "severity" in low or "dns" in low):
            start = i
            break
    reader = csv.DictReader(lines[start:])
    return [{(k or "").strip(): (v or "").strip() for k, v in r.items()} for r in reader]


def _getter(row: dict[str, str]):
    lowered = {k.lower(): v for k, v in row.items()}

    def get(*names: str) -> str:
        for n in names:
            if n in row and row[n]:
                return row[n]
            if n.lower() in lowered and lowered[n.lower()]:
                return lowered[n.lower()]
        return ""

    return get


def _word_sev(value: str) -> str:
    v = (value or "").strip().lower()
    if v in ("critical", "high", "medium", "low", "info", "informational"):
        return "info" if v == "informational" else v
    return "info"


def _txt(parent: ET.Element | None, tag: str) -> str:
    if parent is None:
        return ""
    el = parent.find(tag)
    if el is None:
        for child in parent.iter(tag):
            el = child
            break
    return (el.text or "").strip() if el is not None else ""
