"""Scanner-terminology normalization and canonical entity resolution.

Different scanners describe the same thing with wildly different terminology:
"Apache httpd", "Apache HTTP Server", "Apache Detection", "httpd" all mean the
same canonical service. This module turns raw scanner strings into a single
canonical (vendor, product, service, version, cpe) identity so correlation and
confidence never compare raw strings.

Everything here is deterministic and evidence-driven — no scoring, no defaults
that hide missing data. Unknown products fall back to a cleaned title token so
behavior degrades gracefully rather than inventing an identity.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

CVE_RE = re.compile(r"CVE-\d{4}-\d{3,7}", re.I)
CPE_RE = re.compile(r"cpe:/[aoh]:[^\s\"']+", re.I)

# Version token: 1.2, 1.2.3, 2.4.49, 5.7.0-ubuntu, 8.2p1 ...
_VERSION_RE = re.compile(
    r"(?<![\w.])(\d+\.\d+(?:\.\d+){0,3}(?:[-_]?(?:p\d+|build\d+|[A-Za-z]*\d[\w.]*))?)(?![\w.])"
)
# Reject IPs / dates masquerading as versions.
_NOT_VERSION_RE = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$|^\d{4}\.\d{1,2}\.\d{1,2}$")


@dataclass(frozen=True)
class ProductSignature:
    """One canonical product and the aliases/patterns that resolve to it."""

    vendor: str
    product: str
    service: str
    kind: str
    patterns: tuple[str, ...]
    cpe_hint: str = ""

    def compiled(self) -> re.Pattern[str]:
        return re.compile("|".join(rf"(?:{p})" for p in self.patterns), re.I)


# Ordered most-specific-first. Each entry collapses many scanner spellings into
# a single canonical service. This is the ontology Priority 2 asks for.
_SIGNATURES: list[ProductSignature] = [
    ProductSignature("Apache", "Apache HTTP Server", "http", "software",
        (r"apache[\s_-]*httpd", r"apache[\s_-]*http", r"apache[\s_-]*server",
         r"apache[\s_-]*web", r"apache[\s_-]*detection", r"\bhttpd\b", r"\bapache\b"),
        "cpe:/a:apache:http_server"),
    ProductSignature("Apache", "Apache Tomcat", "http", "software",
        (r"tomcat", r"apache[\s_-]*coyote", r"catalina"), "cpe:/a:apache:tomcat"),
    ProductSignature("nginx", "nginx", "http", "software",
        (r"\bnginx\b",), "cpe:/a:nginx:nginx"),
    ProductSignature("Microsoft", "Microsoft IIS", "http", "software",
        (r"microsoft[\s_-]*iis", r"\biis\b", r"internet information services"),
        "cpe:/a:microsoft:iis"),
    ProductSignature("OpenBSD", "OpenSSH", "ssh", "software",
        (r"openssh", r"ssh[\s_-]*service", r"ssh[\s_-]*server", r"\bsshd\b", r"\bssh\b"),
        "cpe:/a:openbsd:openssh"),
    ProductSignature("Samba", "Samba SMB", "smb", "software",
        (r"\bsamba\b", r"\bsmbd\b", r"netbios[\s_-]*ssn", r"microsoft[\s_-]*ds",
         r"\bsmb\b", r"\bcifs\b"), "cpe:/a:samba:samba"),
    ProductSignature("Microsoft", "Microsoft RDP", "rdp", "software",
        (r"\brdp\b", r"remote desktop", r"ms-wbt-server", r"terminal service"),
        ""),
    ProductSignature("OpenLDAP", "LDAP", "ldap", "software",
        (r"\bldaps?\b", r"lightweight directory", r"active directory ldap"), ""),
    ProductSignature("Oracle", "MySQL", "mysql", "database",
        (r"\bmysql\b", r"mariadb"), "cpe:/a:mysql:mysql"),
    ProductSignature("PostgreSQL", "PostgreSQL", "postgresql", "database",
        (r"postgre[s]?[qs]?l?", r"\bpostgres\b", r"\bpgsql\b"),
        "cpe:/a:postgresql:postgresql"),
    ProductSignature("Redis", "Redis", "redis", "database",
        (r"\bredis\b",), "cpe:/a:redis:redis"),
    ProductSignature("MongoDB", "MongoDB", "mongodb", "database",
        (r"\bmongo(?:db)?\b",), ""),
    ProductSignature("Jenkins", "Jenkins", "http", "software",
        (r"\bjenkins\b", r"hudson"), "cpe:/a:jenkins:jenkins"),
    ProductSignature("Grafana", "Grafana", "http", "software",
        (r"\bgrafana\b",), ""),
    ProductSignature("vsftpd", "vsftpd", "ftp", "software",
        (r"vsftpd", r"very secure ftp"), "cpe:/a:vsftpd:vsftpd"),
    ProductSignature("ProFTPD", "ProFTPD", "ftp", "software",
        (r"proftpd",), "cpe:/a:proftpd:proftpd"),
    ProductSignature("Generic", "FTP Service", "ftp", "software",
        (r"\bftp\b", r"file transfer protocol"), ""),
    ProductSignature("ISC", "BIND DNS", "dns", "software",
        (r"\bbind\b", r"\bnamed\b", r"domain name"), ""),
    ProductSignature("Generic", "DNS Service", "dns", "network",
        (r"\bdns\b",), ""),
    ProductSignature("Generic", "SMTP Service", "smtp", "software",
        (r"\bsmtp\b", r"postfix", r"exim", r"sendmail", r"mail server"), ""),
    ProductSignature("OpenSSL", "TLS/SSL", "ssl", "software",
        (r"openssl", r"\btls\b", r"\bssl\b", r"heartbleed"), ""),
]

# Purely informational / probe titles — a distinct canonical kind so the
# confidence engine never frames them as exploitable.
_INFORMATIONAL_RE = re.compile(
    r"tcpwrapped|nping|echo[\s_-]*reply|http[-_\s]?title|ssl-date|ssh-hostkey|"
    r"ftp-syst|fingerprint-strings|system[-_\s]?info|traceroute|ike-version|"
    r"dns-nsid|smb-os-discovery|robots\.txt|title:",
    re.I,
)
_VULN_HINT_RE = re.compile(
    r"traversal|injection|overflow|rce|remote code|deserial|xxe|ssrf|"
    r"disclosure|bypass|unauth|default[\s_-]*(?:pass|cred)|backdoor|shellshock|"
    r"log4j|heartbleed|weak cipher",
    re.I,
)
_CREDENTIAL_RE = re.compile(
    r"credential|password|access key|secret|token|anonymous login|api[\s_-]*key",
    re.I,
)
_WEB_RE = re.compile(r"\bxss\b|csrf|\bsqli\b|servlet|\bjsp\b|\bphp\b|cookie|header", re.I)


def extract_version(*texts: str) -> str:
    """First plausible version string across the given texts, or ''."""
    for text in texts:
        if not text:
            continue
        for m in _VERSION_RE.finditer(text):
            ver = m.group(1)
            if _NOT_VERSION_RE.match(ver):
                continue
            return ver
    return ""


def extract_cpe(*texts: str) -> str:
    for text in texts:
        if not text:
            continue
        m = CPE_RE.search(text)
        if m:
            return m.group(0)
    return ""


def _match_signature(text: str) -> ProductSignature | None:
    for sig in _SIGNATURES:
        if sig.compiled().search(text):
            return sig
    return None


def canonical_kind(title: str, evidence_text: str, cve: str, severity: str) -> str:
    blob = f"{title} {evidence_text}"
    if cve or CVE_RE.search(blob):
        return "vulnerability"
    if _INFORMATIONAL_RE.search(title):
        if re.search(r"nping|tcpwrapped|traceroute|echo", title, re.I):
            return "network"
        return "informational"
    if _VULN_HINT_RE.search(blob):
        return "vulnerability"
    if _CREDENTIAL_RE.search(blob):
        return "credential"
    if _WEB_RE.search(blob):
        return "web"
    sig = _match_signature(f"{title} {evidence_text}")
    if sig:
        return sig.kind
    if (severity or "").lower() in ("critical", "high", "medium"):
        return "vulnerability"
    return "service"


def _clean_fallback_product(title: str) -> str:
    t = re.sub(r"\s+", " ", (title or "").strip())
    return t[:60] or "Unknown entity"


@dataclass
class CanonicalResolution:
    kind: str
    vendor: str = ""
    product: str = ""
    service: str = ""
    version: str = ""
    cpe: str = ""
    label: str = ""
    matched_signature: bool = False

    def key(self, host: str, port: int | None) -> str:
        """Deterministic correlation key.

        CVE findings keep CVE-based identity (handled by the caller) so path
        parity is preserved; here we key normalized services by
        host|service-or-product|port so cross-terminology duplicates collapse.
        """
        anchor = (self.product or self.service or "entity").lower()
        return f"{host.lower()}|{anchor}|{port if port is not None else '-'}"


def resolve_entity(
    *,
    title: str,
    service: str,
    evidence_texts: list[str],
    cve: str,
    severity: str,
) -> CanonicalResolution:
    """Resolve raw scanner terminology into a canonical entity."""
    evidence_text = " ".join(t for t in evidence_texts if t)
    search_text = f"{title} {service} {evidence_text}"
    kind = canonical_kind(title, evidence_text, cve, severity)
    version = extract_version(title, service, evidence_text)
    cpe = extract_cpe(search_text)

    sig = _match_signature(search_text)
    if sig:
        product = sig.product
        label = f"{product} {version}".strip() if version else product
        return CanonicalResolution(
            kind=kind if kind in ("vulnerability", "credential", "web") else sig.kind,
            vendor=sig.vendor,
            product=product,
            service=sig.service,
            version=version,
            cpe=cpe or sig.cpe_hint,
            label=label,
            matched_signature=True,
        )

    # Unknown product — degrade gracefully to a cleaned title token.
    product = _clean_fallback_product(title)
    label = f"{product} {version}".strip() if version else product
    return CanonicalResolution(
        kind=kind,
        vendor="",
        product=product,
        service=service or "",
        version=version,
        cpe=cpe,
        label=label,
        matched_signature=False,
    )
