"""Service Intelligence (Priorities 7 & 8).

Every service gets its own investigation profile so VANE reasons the way a
senior engineer would — Apache is investigated differently from SSH, SMB, or
Jenkins. Recommendations are derived from the *evidence gaps* specific to each
service, never generic "search logs" boilerplate.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from vayne.models import CorrelatedFinding, ValidationResult


@dataclass
class Recommendation:
    action: str
    rationale: str
    evidence_gap: str
    priority: str  # high | medium | low

    def as_dict(self) -> dict[str, Any]:
        return {
            "action": self.action,
            "rationale": self.rationale,
            "evidence_gap": self.evidence_gap,
            "priority": self.priority,
        }


# A recommendation rule fires when its gap predicate is true for a finding.
Rule = tuple[Callable[[CorrelatedFinding, ValidationResult], bool], Recommendation]


@dataclass
class ServiceProfile:
    key: str
    display: str
    typical_attack_surface: list[str]
    evidence_quality_rules: list[str]
    common_exploit_paths: list[str]
    typical_validation: list[str]
    business_impact_model: dict[str, Any]
    recommendation_rules: list[Rule] = field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        return {
            "service": self.key,
            "display": self.display,
            "typical_attack_surface": self.typical_attack_surface,
            "evidence_quality_rules": self.evidence_quality_rules,
            "common_exploit_paths": self.common_exploit_paths,
            "typical_validation": self.typical_validation,
            "business_impact_model": self.business_impact_model,
        }


def _rec(action: str, rationale: str, gap: str, priority: str = "medium") -> Recommendation:
    return Recommendation(action=action, rationale=rationale, evidence_gap=gap, priority=priority)


# Common gap predicates -------------------------------------------------------
def _no_replay(_c: CorrelatedFinding, v: ValidationResult) -> bool:
    return not v.reproducible and str(v.exploitability_status) != "confirmed"


def _no_version(_c: CorrelatedFinding, v: ValidationResult) -> bool:
    return not v.version_matches


def _no_auth_check(_c: CorrelatedFinding, v: ValidationResult) -> bool:
    return not v.auth_required and str(v.exploitability_status) != "confirmed"


def _reachable(_c: CorrelatedFinding, v: ValidationResult) -> bool:
    return v.reachable


def _always(_c: CorrelatedFinding, _v: ValidationResult) -> bool:
    return True


_PROFILES: dict[str, ServiceProfile] = {
    "apache": ServiceProfile(
        key="apache", display="Apache HTTP Server",
        typical_attack_surface=["Path traversal / mod_proxy", "Exposed mod_status", "Outdated modules", "CGI handlers"],
        evidence_quality_rules=["Server banner is spoofable — prefer HTTP replay", "Version in Server header is authoritative only if replayed"],
        common_exploit_paths=["CVE path traversal → file read → RCE", "mod_cgi → command execution"],
        typical_validation=["HTTP replay of a benign traversal probe", "mod_status reachability check"],
        business_impact_model={"exposure": "internet", "data_sensitivity": "medium", "recovery": "moderate"},
        recommendation_rules=[
            (_no_replay, _rec("Replay a benign HTTP request to confirm the version and behavior",
                              "Banner alone is spoofable; a replay establishes ground truth",
                              "No HTTP replay evidence", "high")),
            (_always, _rec("Check whether mod_status / server-status is exposed",
                           "mod_status leaks internal request data and worker state",
                           "mod_status exposure unknown", "medium")),
            (_always, _rec("Verify loaded modules (mod_cgi, mod_proxy) for known-vulnerable configs",
                           "Vulnerable modules widen the attack surface materially",
                           "Module inventory missing", "medium")),
            (_reachable, _rec("Review access.log for exploitation attempts against this version",
                              "Reachable internet-facing Apache is actively targeted",
                              "No log correlation performed", "low")),
        ],
    ),
    "ssh": ServiceProfile(
        key="ssh", display="OpenSSH",
        typical_attack_surface=["Weak KEX / ciphers", "Password auth exposure", "Outdated version CVEs"],
        evidence_quality_rules=["Banner version is reliable for OpenSSH", "Algorithm support requires an NSE / handshake probe"],
        common_exploit_paths=["Weak credentials → shell", "Auth bypass CVE → access"],
        typical_validation=["KEX/cipher enumeration", "Credential policy review"],
        business_impact_model={"exposure": "internet", "data_sensitivity": "high", "recovery": "hard"},
        recommendation_rules=[
            (_always, _rec("Enumerate key exchange and cipher algorithms for weak/legacy support",
                           "Weak KEX/ciphers enable downgrade and MITM",
                           "No algorithm enumeration", "high")),
            (_always, _rec("Confirm whether password authentication is permitted",
                           "Password auth exposes SSH to credential attacks",
                           "Auth method unknown", "medium")),
            (_no_version, _rec("Confirm the exact OpenSSH version from the handshake banner",
                               "Version drives CVE applicability",
                               "Version not confirmed", "medium")),
            (_always, _rec("Audit credential policy and key management for this host",
                           "SSH compromise usually depends on credential weakness",
                           "No credential audit", "low")),
        ],
    ),
    "smb": ServiceProfile(
        key="smb", display="SMB / Samba",
        typical_attack_surface=["SMB signing disabled", "Anonymous/guest access", "SMBv1 enabled", "NTLM relay"],
        evidence_quality_rules=["Protocol dialect requires a negotiate probe", "Guest access must be replayed, not inferred"],
        common_exploit_paths=["SMBv1 RCE (EternalBlue class)", "NTLM relay → lateral movement", "Anonymous share → data access"],
        typical_validation=["Signing check", "Guest session attempt", "Dialect negotiation"],
        business_impact_model={"exposure": "internal", "data_sensitivity": "high", "recovery": "hard", "lateral": True},
        recommendation_rules=[
            (_always, _rec("Check whether SMB signing is required",
                           "Unsigned SMB enables NTLM relay to lateral movement",
                           "Signing state unknown", "high")),
            (_always, _rec("Attempt an anonymous/guest session to enumerate shares",
                           "Guest-accessible shares often expose sensitive data",
                           "Guest access not tested", "high")),
            (_always, _rec("Confirm whether SMBv1 is enabled",
                           "SMBv1 carries wormable RCE risk",
                           "Dialect not confirmed", "medium")),
        ],
    ),
    "ldap": ServiceProfile(
        key="ldap", display="LDAP",
        typical_attack_surface=["Anonymous bind", "Directory enumeration", "Kerberos / SPN exposure"],
        evidence_quality_rules=["Anonymous bind must be tested, not assumed", "Directory data requires an authenticated or anonymous query"],
        common_exploit_paths=["Anonymous bind → user enumeration → password spray", "SPN → Kerberoasting"],
        typical_validation=["Anonymous bind attempt", "Base DN enumeration"],
        business_impact_model={"exposure": "internal", "data_sensitivity": "high", "recovery": "hard", "lateral": True},
        recommendation_rules=[
            (_always, _rec("Attempt an anonymous bind and enumerate the base DN",
                           "Anonymous bind leaks the directory structure and users",
                           "Anonymous bind not tested", "high")),
            (_always, _rec("Enumerate SPNs for Kerberoasting exposure",
                           "Exposed SPNs enable offline credential cracking",
                           "SPN inventory missing", "medium")),
        ],
    ),
    "jenkins": ServiceProfile(
        key="jenkins", display="Jenkins",
        typical_attack_surface=["Anonymous access", "Script Console", "CLI RCE", "Plugin CVEs"],
        evidence_quality_rules=["Anonymous access must be replayed", "Plugin versions require an authenticated inventory"],
        common_exploit_paths=["Anonymous → Script Console → RCE", "CLI deserialization → RCE", "Vulnerable plugin → RCE"],
        typical_validation=["Anonymous dashboard access", "Script Console reachability", "Plugin inventory"],
        business_impact_model={"exposure": "internet", "data_sensitivity": "high", "recovery": "hard", "supply_chain": True},
        recommendation_rules=[
            (_always, _rec("Test anonymous access to the Jenkins dashboard",
                           "Anonymous access frequently exposes build secrets and RCE",
                           "Anonymous access not confirmed", "high")),
            (_always, _rec("Check whether the Script Console is reachable",
                           "Script Console is direct Groovy RCE",
                           "Script Console exposure unknown", "high")),
            (_always, _rec("Inventory installed plugins and versions for known CVEs",
                           "Vulnerable plugins are the most common Jenkins RCE vector",
                           "Plugin inventory missing", "medium")),
        ],
    ),
    "mysql": ServiceProfile(
        key="mysql", display="MySQL",
        typical_attack_surface=["Anonymous auth", "Weak/no SSL", "Outdated version", "Overly broad grants"],
        evidence_quality_rules=["Auth requirement must be tested with a login attempt", "SSL support requires a handshake probe"],
        common_exploit_paths=["Anonymous auth → data access", "Credential reuse → data exfiltration"],
        typical_validation=["Anonymous login attempt", "SSL/TLS handshake check"],
        business_impact_model={"exposure": "internal", "data_sensitivity": "critical", "recovery": "hard", "data": True},
        recommendation_rules=[
            (_always, _rec("Attempt an anonymous MySQL login",
                           "Anonymous auth grants direct data access",
                           "Anonymous auth not tested", "high")),
            (_always, _rec("Verify whether SSL/TLS is enforced for connections",
                           "Cleartext MySQL exposes credentials and data in transit",
                           "SSL enforcement unknown", "medium")),
            (_always, _rec("Enable and review slow query logs for anomalous access",
                           "Slow query logs reveal exfiltration-style queries",
                           "No query log review", "low")),
        ],
    ),
    "redis": ServiceProfile(
        key="redis", display="Redis",
        typical_attack_surface=["Unauthenticated access", "CONFIG persistence abuse", "Module load RCE"],
        evidence_quality_rules=["Unauthenticated access must be confirmed with a PING/INFO", "Version from INFO is authoritative"],
        common_exploit_paths=["Unauth access → CONFIG SET → webshell/SSH key → RCE"],
        typical_validation=["Unauthenticated PING/INFO", "CONFIG GET dir check"],
        business_impact_model={"exposure": "internal", "data_sensitivity": "high", "recovery": "moderate", "data": True},
        recommendation_rules=[
            (_always, _rec("Confirm unauthenticated access with a PING/INFO command",
                           "Unauthenticated Redis is trivially abused for RCE",
                           "Auth state not confirmed", "high")),
            (_always, _rec("Check CONFIG GET dir/dbfilename for persistence abuse potential",
                           "Writable persistence path enables RCE via key material",
                           "Persistence config unknown", "medium")),
        ],
    ),
    "mongodb": ServiceProfile(
        key="mongodb", display="MongoDB",
        typical_attack_surface=["No authentication", "Internet exposure", "Overly broad roles"],
        evidence_quality_rules=["Auth must be confirmed with a connection attempt", "Exposure requires a reachability check"],
        common_exploit_paths=["Unauth access → full database read/write"],
        typical_validation=["Unauthenticated connection attempt", "Bind address check"],
        business_impact_model={"exposure": "internet", "data_sensitivity": "critical", "recovery": "hard", "data": True},
        recommendation_rules=[
            (_always, _rec("Attempt an unauthenticated connection and list databases",
                           "Unauthenticated MongoDB exposes all data",
                           "Auth state not confirmed", "high")),
            (_reachable, _rec("Verify the bind address is not exposed to the internet",
                              "Internet-exposed MongoDB is a mass-compromise target",
                              "Exposure scope unknown", "high")),
        ],
    ),
    "postgresql": ServiceProfile(
        key="postgresql", display="PostgreSQL",
        typical_attack_surface=["Weak auth (trust/md5)", "SSL not enforced", "COPY PROGRAM RCE"],
        evidence_quality_rules=["Auth method must be tested", "Version from startup is authoritative"],
        common_exploit_paths=["Weak auth → COPY PROGRAM → RCE", "Credential reuse → data access"],
        typical_validation=["Auth method probe", "SSL enforcement check"],
        business_impact_model={"exposure": "internal", "data_sensitivity": "critical", "recovery": "hard", "data": True},
        recommendation_rules=[
            (_always, _rec("Probe the authentication method (trust/md5/scram)",
                           "Trust auth grants direct access; weak methods enable cracking",
                           "Auth method unknown", "high")),
            (_always, _rec("Verify SSL/TLS is enforced for client connections",
                           "Cleartext Postgres exposes credentials and data",
                           "SSL enforcement unknown", "medium")),
        ],
    ),
    "nginx": ServiceProfile(
        key="nginx", display="nginx",
        typical_attack_surface=["Misrouted locations", "Alias traversal", "Outdated version"],
        evidence_quality_rules=["Server header is spoofable — prefer replay", "Version requires replay confirmation"],
        common_exploit_paths=["Alias traversal → file read", "Misconfig → SSRF"],
        typical_validation=["HTTP replay", "Location/alias probe"],
        business_impact_model={"exposure": "internet", "data_sensitivity": "medium", "recovery": "moderate"},
        recommendation_rules=[
            (_no_replay, _rec("Replay an HTTP request to confirm version and routing behavior",
                              "Server header is spoofable; replay establishes ground truth",
                              "No HTTP replay evidence", "high")),
            (_always, _rec("Probe for alias/location traversal misconfigurations",
                           "Alias traversal exposes arbitrary file read",
                           "Routing config not tested", "medium")),
        ],
    ),
    "iis": ServiceProfile(
        key="iis", display="Microsoft IIS",
        typical_attack_surface=["Legacy protocol handlers", "WebDAV", "Short-name enumeration", "Outdated version"],
        evidence_quality_rules=["Server header is spoofable — prefer replay", "Version requires replay"],
        common_exploit_paths=["WebDAV → upload → RCE", "Handler CVE → RCE"],
        typical_validation=["HTTP replay", "WebDAV method probe"],
        business_impact_model={"exposure": "internet", "data_sensitivity": "medium", "recovery": "moderate"},
        recommendation_rules=[
            (_no_replay, _rec("Replay an HTTP request to confirm the IIS version and handlers",
                              "Server header is spoofable; replay establishes ground truth",
                              "No HTTP replay evidence", "high")),
            (_always, _rec("Probe for enabled WebDAV methods",
                           "WebDAV enables file upload leading to RCE",
                           "WebDAV state unknown", "medium")),
        ],
    ),
    "ftp": ServiceProfile(
        key="ftp", display="FTP Service",
        typical_attack_surface=["Anonymous login", "Cleartext credentials", "Backdoored versions"],
        evidence_quality_rules=["Anonymous login must be replayed", "Version banner drives CVE mapping"],
        common_exploit_paths=["Anonymous → file access", "Backdoor version → shell"],
        typical_validation=["Anonymous login attempt", "Version confirmation"],
        business_impact_model={"exposure": "internet", "data_sensitivity": "medium", "recovery": "moderate"},
        recommendation_rules=[
            (_always, _rec("Attempt an anonymous FTP login",
                           "Anonymous FTP exposes files and sometimes write access",
                           "Anonymous login not tested", "high")),
            (_no_version, _rec("Confirm the FTP daemon version for CVE mapping",
                               "Some FTP versions ship known backdoors",
                               "Version not confirmed", "medium")),
        ],
    ),
}

_GENERIC = ServiceProfile(
    key="generic", display="Generic Service",
    typical_attack_surface=["Exposed service", "Version-specific CVEs"],
    evidence_quality_rules=["Prefer replayed/authenticated evidence over banners"],
    common_exploit_paths=["Version CVE → exploitation"],
    typical_validation=["Version confirmation", "Reachability check"],
    business_impact_model={"exposure": "unknown", "data_sensitivity": "medium", "recovery": "moderate"},
    recommendation_rules=[
        (_no_version, _rec("Independently confirm the service version",
                           "Version drives CVE applicability",
                           "Version not confirmed", "medium")),
        (_no_replay, _rec("Reproduce the observation with a second technique",
                          "A single unreplayed observation is weak evidence",
                          "No reproduction / replay", "medium")),
    ],
)

# Map canonical products to profile keys.
_PRODUCT_TO_KEY = {
    "apache http server": "apache",
    "apache tomcat": "jenkins",  # tomcat handled like an app server; closest management-plane profile
    "nginx": "nginx",
    "microsoft iis": "iis",
    "openssh": "ssh",
    "samba smb": "smb",
    "microsoft rdp": "generic",
    "ldap": "ldap",
    "mysql": "mysql",
    "postgresql": "postgresql",
    "redis": "redis",
    "mongodb": "mongodb",
    "jenkins": "jenkins",
    "vsftpd": "ftp",
    "proftpd": "ftp",
    "ftp service": "ftp",
}


def get_profile(finding: CorrelatedFinding) -> ServiceProfile:
    entity = finding.canonical_entity
    if entity:
        key = _PRODUCT_TO_KEY.get((entity.product or "").lower())
        if key:
            return _PROFILES.get(key, _GENERIC)
        svc = (entity.service or "").lower()
        for candidate in ("ssh", "smb", "ldap", "mysql", "redis", "mongodb", "postgresql", "ftp"):
            if candidate in svc:
                return _PROFILES.get(candidate, _GENERIC)
    # Phase 4 — no curated profile matched. Instead of a flat generic profile,
    # synthesize a category-tailored one (web / database / directory / ...), so
    # obscure services are still investigated in a service-appropriate way.
    from vayne.service_intel.synthesize import synthesize_profile

    return synthesize_profile(finding)


def recommendations_for(
    finding: CorrelatedFinding, validation: ValidationResult
) -> list[dict[str, Any]]:
    """Service-specific recommendations, derived from this finding's evidence gaps."""
    profile = get_profile(finding)
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for predicate, rec in profile.recommendation_rules:
        try:
            fire = predicate(finding, validation)
        except Exception:
            fire = False
        if fire and rec.action not in seen:
            seen.add(rec.action)
            out.append(rec.as_dict())
    # Priority order: high first.
    order = {"high": 0, "medium": 1, "low": 2}
    out.sort(key=lambda r: order.get(r["priority"], 3))
    return out
