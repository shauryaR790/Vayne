"""Shared parser helpers."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from vayne.models import Asset, Finding

CVE_RE = re.compile(r"CVE-\d{4}-\d+", re.I)
CWE_RE = re.compile(r"CWE-\d+", re.I)


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def now() -> datetime:
    return datetime.now(timezone.utc)


def extract_cve(text: str) -> str:
    m = CVE_RE.search(text)
    return m.group(0).upper() if m else ""


def extract_cwe(text: str) -> str:
    m = CWE_RE.search(text)
    return m.group(0).upper() if m else ""


def parse_port(value: str | int | None) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(str(value).split("/")[0])
    except ValueError:
        return None


def merge_asset(assets: dict[str, Asset], host: str, **kwargs) -> None:
    ip = kwargs.get("ip", "")
    port = kwargs.get("port")
    service = kwargs.get("service", "")
    tech = kwargs.get("technology", "")
    tag = kwargs.get("tag", "")

    if host not in assets:
        assets[host] = Asset(host=host, ip=ip or host)

    a = assets[host]
    if ip and not a.ip:
        a.ip = ip
    if port and port not in a.ports:
        a.ports.append(port)
    if service and service not in a.services:
        a.services.append(service)
    if tech and tech not in a.technologies:
        a.technologies.append(tech)
    if port and tech:
        a.port_technologies[port] = tech
    if tag and tag not in a.tags:
        a.tags.append(tag)
