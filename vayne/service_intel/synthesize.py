"""Profile synthesis for services without a hand-authored profile (Phase 4).

The curated profiles are excellent for the ~dozen services they cover, but real
scans hit hundreds of services. Rather than fall back to one flat "generic"
profile, this module infers a service *category* from the port, protocol, and
product/service name, then synthesizes a category-appropriate investigation
profile: attack surface, evidence-quality rules, exploit paths, validation, a
business-impact model, and evidence-gap-driven recommendations.

The result is deterministic and derived from the finding — an obscure message
queue is investigated like a message queue, not like "a generic service".
"""

from __future__ import annotations

from typing import Any

from vayne.models import CorrelatedFinding, ValidationResult
from vayne.service_intel.profiles import (
    Recommendation,
    ServiceProfile,
    _always,
    _no_auth_check,
    _no_replay,
    _no_version,
    _reachable,
    _rec,
)

# port -> category
_PORT_CATEGORY: dict[int, str] = {}


def _reg(category: str, *ports: int) -> None:
    for p in ports:
        _PORT_CATEGORY[p] = category


_reg("web", 80, 443, 8080, 8443, 8000, 8888, 8081, 3000, 9000, 8090, 4443, 7001, 9443)
_reg("database", 3306, 5432, 1433, 1521, 27017, 5984, 9200, 9300, 7000, 9042, 8086, 28015, 5433)
_reg("cache", 6379, 11211)
_reg("directory", 389, 636, 88, 464, 749, 3268, 3269)
_reg("remote_admin", 22, 23, 3389, 5900, 5901, 5985, 5986, 512, 513, 514)
_reg("file_transfer", 21, 69, 445, 139, 2049, 873, 990)
_reg("mail", 25, 110, 143, 465, 587, 993, 995, 2525)
_reg("message_queue", 5672, 15672, 9092, 61616, 1883, 8883, 4222)
_reg("orchestration", 2375, 2376, 6443, 10250, 2379, 2380, 8500, 4646)
_reg("monitoring", 9090, 9100, 3001, 2003, 8125, 9091, 5601, 10051, 161)
_reg("dns", 53, 5353)
_reg("vpn", 500, 4500, 1194, 1701, 1723)
_reg("ot", 502, 102, 44818, 20000, 47808)

_KEYWORD_CATEGORY: list[tuple[tuple[str, ...], str]] = [
    (("http", "web", "www", "apache", "nginx", "iis", "tomcat", "jetty", "httpd",
      "express", "flask", "django", "node", "php", "servlet"), "web"),
    (("sql", "mysql", "mariadb", "postgres", "mssql", "oracle", "mongo", "cassandra",
      "elastic", "couch", "influx", "rethink", "cockroach", "dynamo", "db2"), "database"),
    (("redis", "memcache", "hazelcast", "ignite"), "cache"),
    (("ldap", "kerberos", "radius", "directory", "active directory", "freeipa", "openid",
      "saml", "oauth"), "directory"),
    (("ssh", "telnet", "rdp", "vnc", "winrm", "rlogin", "rexec"), "remote_admin"),
    (("ftp", "tftp", "smb", "samba", "cifs", "nfs", "rsync", "webdav"), "file_transfer"),
    (("smtp", "imap", "pop3", "pop", "exchange", "postfix", "sendmail", "dovecot",
      "mail"), "mail"),
    (("amqp", "rabbitmq", "kafka", "activemq", "mqtt", "nats", "zeromq", "pulsar"),
     "message_queue"),
    (("docker", "kubernetes", "kubelet", "etcd", "consul", "nomad", "swarm",
      "containerd", "openshift"), "orchestration"),
    (("prometheus", "grafana", "zabbix", "nagios", "kibana", "snmp", "graphite",
      "statsd", "collectd"), "monitoring"),
    (("dns", "bind", "named", "resolver", "unbound"), "dns"),
    (("vpn", "ipsec", "openvpn", "pptp", "l2tp", "wireguard", "ike"), "vpn"),
    (("modbus", "scada", "s7", "bacnet", "dnp3", "ethernet/ip", "profinet"), "ot"),
]


def _infer_category(finding: CorrelatedFinding) -> str:
    entity = finding.canonical_entity
    text = " ".join(
        s for s in (
            finding.service or "",
            finding.title or "",
            entity.service if entity else "",
            entity.product if entity else "",
            entity.label if entity else "",
        ) if s
    ).lower()
    for keywords, category in _KEYWORD_CATEGORY:
        if any(k in text for k in keywords):
            return category
    if finding.port and finding.port in _PORT_CATEGORY:
        return _PORT_CATEGORY[finding.port]
    return "unknown"


# category -> profile template (deterministic, category-specific content).
_CATEGORY_TEMPLATE: dict[str, dict[str, Any]] = {
    "web": {
        "surface": ["Version-specific CVEs", "Injection / traversal", "Exposed admin or status endpoints", "Weak TLS"],
        "quality": ["Server/version header is spoofable — prefer an HTTP replay", "Confirm behavior, not just the banner"],
        "paths": ["Version CVE → RCE", "Injection → data access", "Exposed admin endpoint → takeover"],
        "validation": ["HTTP replay of a benign request", "TLS/cipher enumeration", "Admin/status endpoint probe"],
        "impact": {"exposure": "internet", "data_sensitivity": "medium", "recovery": "moderate"},
        "rules": [
            (_no_replay, ("Replay a benign HTTP request to confirm version and behavior",
                          "The Server header is spoofable; a replay establishes ground truth",
                          "No HTTP replay evidence", "high")),
            (_always, ("Probe for exposed admin/status/debug endpoints",
                       "Exposed management endpoints frequently lead to takeover",
                       "Endpoint exposure unknown", "medium")),
        ],
    },
    "database": {
        "surface": ["Weak/absent authentication", "Cleartext transport", "Overly broad grants", "Version CVEs"],
        "quality": ["Auth requirement must be tested with a login attempt", "Transport encryption requires a handshake probe"],
        "paths": ["Weak auth → data access", "Credential reuse → exfiltration", "Feature abuse → RCE"],
        "validation": ["Authentication probe", "TLS enforcement check", "Privilege/grant review"],
        "impact": {"exposure": "internal", "data_sensitivity": "critical", "recovery": "hard", "data": True},
        "rules": [
            (_no_auth_check, ("Attempt an unauthenticated/anonymous connection",
                              "Databases exposed without auth grant direct data access",
                              "Auth state not confirmed", "high")),
            (_always, ("Verify transport encryption (TLS) is enforced",
                       "Cleartext database traffic exposes credentials and records",
                       "Transport encryption unknown", "medium")),
        ],
    },
    "cache": {
        "surface": ["Unauthenticated access", "Persistence/config abuse", "Data exposure"],
        "quality": ["Unauthenticated access must be confirmed with a status command", "Version from status is authoritative"],
        "paths": ["Unauth access → data read/write", "Config abuse → RCE via persistence"],
        "validation": ["Unauthenticated status probe", "Config/persistence check"],
        "impact": {"exposure": "internal", "data_sensitivity": "high", "recovery": "moderate", "data": True},
        "rules": [
            (_no_auth_check, ("Confirm whether the cache accepts unauthenticated commands",
                              "Unauthenticated in-memory stores are trivially abused",
                              "Auth state not confirmed", "high")),
        ],
    },
    "directory": {
        "surface": ["Anonymous bind / enumeration", "Credential exposure", "Kerberos/SPN abuse"],
        "quality": ["Anonymous access must be tested, not assumed", "Directory data requires an actual query"],
        "paths": ["Anonymous bind → enumeration → password spray", "SPN → offline cracking"],
        "validation": ["Anonymous bind attempt", "Directory enumeration"],
        "impact": {"exposure": "internal", "data_sensitivity": "high", "recovery": "hard", "lateral": True},
        "rules": [
            (_no_auth_check, ("Attempt anonymous access and enumerate the directory",
                              "Anonymous directory access leaks users and structure",
                              "Anonymous access not tested", "high")),
        ],
    },
    "remote_admin": {
        "surface": ["Weak credentials / brute force", "Legacy protocol / weak crypto", "Version CVEs"],
        "quality": ["Version banner drives CVE mapping", "Algorithm/crypto support requires a handshake probe"],
        "paths": ["Weak credentials → interactive session", "Auth bypass CVE → access", "Session hijack via weak crypto"],
        "validation": ["Auth method / policy review", "Crypto/cipher enumeration", "Version confirmation"],
        "impact": {"exposure": "internet", "data_sensitivity": "high", "recovery": "hard", "lateral": True},
        "rules": [
            (_always, ("Review the authentication method and credential policy",
                       "Remote-admin services are compromised primarily via weak credentials",
                       "Auth policy unknown", "high")),
            (_no_version, ("Confirm the exact service version for CVE mapping",
                           "Version drives which remote-access CVEs apply",
                           "Version not confirmed", "medium")),
        ],
    },
    "file_transfer": {
        "surface": ["Anonymous/guest access", "Cleartext credentials", "Writable shares", "Legacy protocol RCE"],
        "quality": ["Anonymous access must be replayed", "Share/write access must be tested, not inferred"],
        "paths": ["Anonymous access → data read", "Writable share → upload → RCE", "Legacy dialect → wormable RCE"],
        "validation": ["Anonymous/guest session attempt", "Share enumeration", "Dialect/version check"],
        "impact": {"exposure": "internal", "data_sensitivity": "high", "recovery": "hard", "lateral": True},
        "rules": [
            (_no_auth_check, ("Attempt an anonymous/guest session and enumerate shares",
                              "Anonymous file services routinely expose sensitive data",
                              "Anonymous access not tested", "high")),
            (_always, ("Confirm whether legacy/insecure protocol versions are enabled",
                       "Legacy file-transfer dialects carry wormable RCE risk",
                       "Protocol version not confirmed", "medium")),
        ],
    },
    "mail": {
        "surface": ["Open relay", "Auth exposure", "STARTTLS downgrade", "User enumeration"],
        "quality": ["Relay behavior must be tested with a probe", "STARTTLS support requires a handshake"],
        "paths": ["Open relay → spam/phishing", "User enumeration → password spray", "Downgrade → credential capture"],
        "validation": ["Relay test", "STARTTLS probe", "VRFY/EXPN enumeration check"],
        "impact": {"exposure": "internet", "data_sensitivity": "medium", "recovery": "moderate"},
        "rules": [
            (_always, ("Test for open-relay behavior",
                       "Open relays are abused for phishing and damage sender reputation",
                       "Relay behavior unknown", "high")),
            (_always, ("Confirm STARTTLS is offered and enforced",
                       "Missing STARTTLS exposes mail credentials to capture",
                       "Transport encryption unknown", "medium")),
        ],
    },
    "message_queue": {
        "surface": ["Unauthenticated access", "Default credentials", "Management console exposure", "Topic/queue enumeration"],
        "quality": ["Auth must be tested with a connection attempt", "Console exposure must be replayed"],
        "paths": ["Unauth access → message tampering", "Default creds → console → control", "Queue enumeration → data exposure"],
        "validation": ["Unauthenticated connection attempt", "Management console probe", "Default-credential check"],
        "impact": {"exposure": "internal", "data_sensitivity": "high", "recovery": "moderate", "data": True},
        "rules": [
            (_no_auth_check, ("Attempt an unauthenticated connection to the broker",
                              "Unauthenticated brokers allow message tampering and data theft",
                              "Auth state not confirmed", "high")),
            (_always, ("Check for an exposed management console with default credentials",
                       "Broker consoles with default creds grant full control",
                       "Console/credential state unknown", "medium")),
        ],
    },
    "orchestration": {
        "surface": ["Unauthenticated API", "Exposed kubelet/etcd", "Token/secret exposure", "Privileged workloads"],
        "quality": ["API auth must be tested", "Secret/token exposure must be confirmed, not assumed"],
        "paths": ["Unauth API → workload deploy → node compromise", "etcd read → cluster secrets → takeover"],
        "validation": ["Unauthenticated API probe", "Anonymous kubelet/etcd query", "RBAC review"],
        "impact": {"exposure": "internal", "data_sensitivity": "critical", "recovery": "hard", "lateral": True, "supply_chain": True},
        "rules": [
            (_no_auth_check, ("Probe the orchestration API for unauthenticated access",
                              "An exposed control-plane API leads to full cluster compromise",
                              "API auth state not confirmed", "high")),
            (_always, ("Check for anonymous access to kubelet/etcd/datastore ports",
                       "Anonymous datastore access exposes all cluster secrets",
                       "Datastore exposure unknown", "high")),
        ],
    },
    "monitoring": {
        "surface": ["Unauthenticated dashboards", "Metric/label information disclosure", "Default credentials", "SSRF via data sources"],
        "quality": ["Dashboard exposure must be replayed", "Data-source config requires an authenticated view"],
        "paths": ["Unauth dashboard → data-source SSRF → internal access", "Default creds → admin → pivot"],
        "validation": ["Unauthenticated dashboard probe", "Default-credential check", "Data-source review"],
        "impact": {"exposure": "internal", "data_sensitivity": "medium", "recovery": "moderate"},
        "rules": [
            (_no_replay, ("Confirm whether the monitoring dashboard is reachable without auth",
                          "Unauthenticated monitoring exposes internal topology and enables SSRF",
                          "Dashboard exposure not confirmed", "high")),
        ],
    },
    "dns": {
        "surface": ["Zone transfer (AXFR)", "Cache poisoning exposure", "Recursion open to the internet", "Version disclosure"],
        "quality": ["AXFR must be attempted, not inferred", "Recursion state requires a query probe"],
        "paths": ["AXFR → full internal map", "Open recursion → amplification / poisoning"],
        "validation": ["AXFR attempt", "Recursion probe", "Version query"],
        "impact": {"exposure": "internet", "data_sensitivity": "medium", "recovery": "moderate"},
        "rules": [
            (_always, ("Attempt a zone transfer (AXFR)",
                       "A successful AXFR discloses the entire internal namespace",
                       "AXFR not attempted", "high")),
            (_reachable, ("Check whether recursion is open to untrusted clients",
                          "Open recursion enables amplification and cache poisoning",
                          "Recursion state unknown", "medium")),
        ],
    },
    "vpn": {
        "surface": ["Weak IKE/crypto", "Aggressive-mode PSK exposure", "Version CVEs", "Credential brute force"],
        "quality": ["Crypto support requires a handshake probe", "Version banner drives CVE mapping"],
        "paths": ["Aggressive mode → PSK capture → offline crack → access", "Version CVE → pre-auth compromise"],
        "validation": ["IKE handshake enumeration", "Aggressive-mode probe", "Version confirmation"],
        "impact": {"exposure": "internet", "data_sensitivity": "high", "recovery": "hard", "lateral": True},
        "rules": [
            (_always, ("Enumerate IKE/crypto support and check for aggressive mode",
                       "Aggressive-mode PSK exposure enables offline credential cracking",
                       "Crypto/mode support unknown", "high")),
        ],
    },
    "ot": {
        "surface": ["Unauthenticated control protocol", "No transport security", "Safety-impacting commands", "Legacy firmware"],
        "quality": ["Protocol behavior must be observed passively — never send control writes", "Firmware version drives CVE mapping"],
        "paths": ["Unauth protocol access → process manipulation → safety impact"],
        "validation": ["Passive protocol identification", "Read-only register query (if authorized)", "Firmware version confirmation"],
        "impact": {"exposure": "internal", "data_sensitivity": "critical", "recovery": "hard", "safety": True},
        "rules": [
            (_always, ("Confirm the control protocol and whether it requires authentication (read-only)",
                       "Unauthenticated OT protocols allow safety-impacting manipulation",
                       "Protocol auth state unknown", "high")),
        ],
    },
    "unknown": {
        "surface": ["Exposed service", "Version-specific CVEs", "Unknown authentication posture"],
        "quality": ["Prefer replayed/authenticated evidence over banners", "Identify the service before deeper analysis"],
        "paths": ["Version CVE → exploitation"],
        "validation": ["Service identification", "Version confirmation", "Reachability check"],
        "impact": {"exposure": "unknown", "data_sensitivity": "medium", "recovery": "moderate"},
        "rules": [
            (_always, ("Identify the service and product from an active probe",
                       "The service category is unclear; identification precedes analysis",
                       "Service not positively identified", "high")),
            (_no_version, ("Independently confirm the service version",
                           "Version drives CVE applicability",
                           "Version not confirmed", "medium")),
        ],
    },
}


def _display_name(finding: CorrelatedFinding, category: str) -> str:
    entity = finding.canonical_entity
    if entity and (entity.label or entity.product or entity.service):
        return entity.label or entity.product or entity.service
    if finding.service:
        return finding.service
    label = category.replace("_", " ").title()
    if finding.port:
        return f"{label} service (port {finding.port})"
    return f"{label} service"


def synthesize_profile(finding: CorrelatedFinding) -> ServiceProfile:
    category = _infer_category(finding)
    tpl = _CATEGORY_TEMPLATE.get(category, _CATEGORY_TEMPLATE["unknown"])
    rules = [
        (pred, _rec(action, rationale, gap, priority))
        for pred, (action, rationale, gap, priority) in tpl["rules"]
    ]
    # Always ensure a version-confirmation gap exists when unverified.
    if not any("version" in r[1].evidence_gap.lower() for r in rules):
        rules.append(
            (_no_version, _rec("Independently confirm the service version",
                               "Version drives CVE applicability",
                               "Version not confirmed", "medium"))
        )
    return ServiceProfile(
        key=f"synth:{category}",
        display=_display_name(finding, category),
        typical_attack_surface=list(tpl["surface"]),
        evidence_quality_rules=list(tpl["quality"]),
        common_exploit_paths=list(tpl["paths"]),
        typical_validation=list(tpl["validation"]),
        business_impact_model=dict(tpl["impact"]),
        recommendation_rules=rules,
    )
