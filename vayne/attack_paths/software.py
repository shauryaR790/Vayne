"""Software fingerprint parsing and deduplication."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class SoftwareFingerprint:
    vendor: str
    product: str
    version: str

    @property
    def specificity(self) -> int:
        return len(self.version) + len(self.product)

    def node_id(self, host: str) -> str:
        if self.version:
            return f"software:{host}:{self.vendor}:{self.product}:{self.version}"
        return f"software:{host}:{self.vendor}:{self.product}"

    def label(self) -> str:
        if self.version:
            return f"{self.vendor}/{self.product}:{self.version}"
        return f"{self.vendor}/{self.product}"


def parse_software(text: str) -> SoftwareFingerprint | None:
    text = text.strip()
    if not text:
        return None

    patterns: list[tuple[re.Pattern[str], str, str]] = [
        (re.compile(r"(?i)^vsftpd\s+([\d.]+)$"), "vsftpd", "vsftpd"),
        (re.compile(r"(?i)^proftpd\s+([\d.]+)$"), "proftpd", "proftpd"),
        (re.compile(r"(?i)^unrealircd(?:\s+([\d.]+))?$"), "unrealircd", "unrealircd"),
        (re.compile(r"(?i)^samba\s+smbd(?:\s+([\d.\-\w]+))?$"), "samba", "samba"),
        (re.compile(r"(?i)^distcc(?:d)?$"), "distcc", "distcc"),
        (re.compile(r"(?i)^apache\s+tomcat.*?(?:\s+([\d.]+))?$"), "apache", "tomcat"),
        (re.compile(r"(?i)^apache\s+httpd\s+([\d.]+)$"), "apache", "httpd"),
        (re.compile(r"(?i)^apache\s+([\d.]+)$"), "apache", "httpd"),
        (re.compile(r"(?i)^postgresql\s+([\d.]+)$"), "postgresql", "postgresql"),
        (re.compile(r"(?i)^openssh\s+([\d.]+)$"), "openssh", "openssh"),
        (re.compile(r"(?i)^nginx\s+([\d.]+)$"), "nginx", "nginx"),
        (re.compile(r"(?i)^mysql\s+([\d.]+)$"), "mysql", "mysql"),
        (re.compile(r"(?i)^amazons3$"), "amazon", "s3"),
    ]
    for pattern, vendor, product in patterns:
        m = pattern.match(text)
        if m:
            version = m.group(1) if m.lastindex else ""
            return SoftwareFingerprint(vendor, product, version)

    generic = re.match(r"(?i)^([a-z0-9_-]+)\s+([\d.]+)$", text)
    if generic:
        return SoftwareFingerprint(generic.group(1).lower(), generic.group(1).lower(), generic.group(2))

    return None


def dedupe_software(host: str, technologies: list[str]) -> list[SoftwareFingerprint]:
    parsed: list[SoftwareFingerprint] = []
    for tech in technologies:
        fp = parse_software(tech)
        if fp:
            parsed.append(fp)

    parsed.sort(key=lambda x: x.specificity, reverse=True)
    kept: list[SoftwareFingerprint] = []
    seen: set[tuple[str, str]] = set()
    for fp in parsed:
        key = (fp.vendor, fp.product)
        if key in seen:
            continue
        if fp.version:
            seen.add(key)
            kept.append(fp)
            continue
        if any(k[0] == fp.vendor and k[1] == fp.product for k in seen):
            continue
        seen.add(key)
        kept.append(fp)
    return kept
