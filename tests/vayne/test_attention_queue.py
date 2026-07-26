"""Attention Queue helpers — merge evidence, name files, deterministic actions."""

from __future__ import annotations

from vayne.investigation.analyst_reasons import (
    attention_group_key,
    build_attention_card_fields,
    build_recommended_action,
    build_why_this_matters,
    collect_source_files,
    file_basename,
)
from vayne.models import (
    AnalystBrief,
    CanonicalEntity,
    CorrelatedFinding,
    Finding,
    InvestigatedFinding,
    RemediationTimeline,
    ValidationResult,
)


def _item(
    *,
    fid: str,
    title: str,
    host: str = "10.0.3.26",
    cve: str = "",
    service: str = "http",
    severity: str = "critical",
    sources: list[str] | None = None,
    files: list[str] | None = None,
    raw: list[Finding] | None = None,
    product: str = "Apache HTTP Server",
) -> InvestigatedFinding:
    corr = CorrelatedFinding(
        id=fid,
        title=title,
        host=host,
        service=service,
        severity=severity,
        cve=cve,
        sources=sources or [],
        source_files=files or [],
        findings=raw or [],
        canonical_entity=CanonicalEntity(
            kind="service",
            vendor="Apache",
            product=product,
            service=service,
            label=product,
            key="apache:http",
        ),
    )
    return InvestigatedFinding(
        correlated=corr,
        validation=ValidationResult(),
        analyst=AnalystBrief(),
        remediation=RemediationTimeline(),
        intelligence={},
    )


def test_file_basename_strips_paths():
    assert file_basename(r"C:\uploads\nmap_scan.xml") == "nmap_scan.xml"
    assert file_basename("evidence/nuclei_results.jsonl") == "nuclei_results.jsonl"


def test_related_cve_evidence_shares_group_key():
    a = _item(fid="1", title="Apache HTTP Server 2.4.49", cve="CVE-2021-41773")
    b = _item(fid="2", title="Directory Traversal", cve="CVE-2021-41773")
    c = _item(fid="3", title="Unrelated SSH", cve="", product="OpenSSH", service="ssh")
    c.correlated.canonical_entity = CanonicalEntity(
        kind="service", product="OpenSSH", label="OpenSSH", key="openssh"
    )
    assert attention_group_key(a) == attention_group_key(b)
    assert attention_group_key(a) != attention_group_key(c)


def test_collect_source_files_from_merged_peers():
    a = _item(
        fid="1",
        title="Apache Directory Traversal",
        cve="CVE-2021-41773",
        files=["uploads/nmap_scan.xml"],
        raw=[
            Finding(
                id="r1",
                host="10.0.3.26",
                title="Apache 2.4.49",
                source_tool="nmap",
                source_file="nmap_scan.xml",
                evidence="Apache httpd 2.4.49",
            )
        ],
    )
    b = _item(
        fid="2",
        title="CVE-2021-41773",
        cve="CVE-2021-41773",
        files=["nuclei_results.jsonl"],
        raw=[
            Finding(
                id="r2",
                host="10.0.3.26",
                title="CVE-2021-41773",
                cve="CVE-2021-41773",
                source_tool="nuclei",
                source_file="nuclei_results.jsonl",
            ),
            Finding(
                id="r3",
                host="10.0.3.26",
                title="Directory Traversal",
                source_tool="burp",
                source_file="burp_issues.xml",
                evidence="Directory Traversal",
            ),
        ],
    )
    files = collect_source_files(a, b)
    assert files == ["nmap_scan.xml", "nuclei_results.jsonl", "burp_issues.xml"]


def test_attention_card_answers_four_questions():
    a = _item(
        fid="1",
        title="Apache HTTP Server Directory Traversal",
        cve="CVE-2021-41773",
        sources=["nmap", "nuclei", "burp"],
        files=["nmap_scan.xml", "nuclei_results.jsonl", "burp_issues.xml"],
        raw=[
            Finding(
                id="r1",
                host="10.0.3.26",
                title="Apache 2.4.49",
                source_tool="nmap",
                source_file="nmap_scan.xml",
                evidence="Apache 2.4.49",
            ),
            Finding(
                id="r2",
                host="10.0.3.26",
                title="CVE-2021-41773",
                cve="CVE-2021-41773",
                source_tool="nuclei",
                source_file="nuclei_results.jsonl",
            ),
            Finding(
                id="r3",
                host="10.0.3.26",
                title="Directory Traversal",
                source_tool="burp",
                source_file="burp_issues.xml",
                evidence="Directory Traversal",
            ),
        ],
    )
    card = build_attention_card_fields(
        a,
        quality={"exploitability": 70, "internet_exposure": 80},
        on_path=False,
        host_count=1,
        priority=88,
        confidence=90,
    )
    assert card["subject"] == "Apache HTTP Server"
    assert "Traversal" in card["attention_required"]
    assert len(card["files"]) == 3
    assert card["files"][0] == "nmap_scan.xml"
    assert len(card["evidence"]) >= 2
    assert "Multiple scanners" in card["why_this_matters"]
    assert card["potential_impact"] == "Remote file disclosure possible."
    assert "Upgrade Apache" in card["recommended_action"]


def test_potential_impact_rce():
    from vayne.investigation.analyst_reasons import build_potential_impact

    assert (
        build_potential_impact(title="Remote Code Execution via CGI", theme="rce")
        == "Remote code execution possible."
    )


def test_single_source_outdated_ssh_action():
    action = build_recommended_action(
        title="OpenSSH 7.2p2",
        subject="OpenSSH 7.2p2",
        service="ssh",
        theme="outdated",
    )
    assert "supported" in action.lower()
    why = build_why_this_matters(scanners=["nmap"], theme="outdated")
    assert "No exploit evidence" in why
