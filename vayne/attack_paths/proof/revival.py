"""Revival engine (Phase G).

Given the evidence a rejected path is missing, deterministically suggest the
collection action and concrete tools that could supply that evidence and revive
the path. Pure keyword routing — no LLM, no randomness, fully ordered output.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RevivalOption:
    missing: str
    action: str
    tools: list[str]
    expected_capability: str

    def to_dict(self) -> dict:
        return {
            "missing": self.missing,
            "action": self.action,
            "tools": list(self.tools),
            "expected_capability": self.expected_capability,
        }


# (keyword, action, tools, capability the evidence would unlock). Ordered so the
# first matching rule wins deterministically.
_RULES: list[tuple[tuple[str, ...], str, list[str], str]] = [
    (("iam role", "iam permission", "cloud permission", "assume role"),
     "IAM audit / permission enumeration",
     ["aws iam get-account-authorization-details", "ScoutSuite", "Pacu"],
     "identity_escalation"),
    (("credential", "password", "secret", "api key", "token"),
     "secrets / credential discovery scan",
     ["trufflehog", "gitleaks", "LaZagne"],
     "credential_access"),
    (("database auth", "database access", "db credential"),
     "database credential discovery",
     ["trufflehog", "credential spraying", "config review"],
     "data_access"),
    (("lateral", "credential reuse", "trust relationship", "pivot"),
     "lateral movement / trust mapping",
     ["BloodHound", "CrackMapExec"],
     "lateral_movement"),
    (("network route", "reachability", "network path", "unreachable"),
     "internal network reachability scan",
     ["nmap", "internal port scan"],
     "initial_access"),
    (("privilege escalation", "privilege", "escalation"),
     "privilege escalation enumeration",
     ["linpeas", "winpeas", "GTFOBins review"],
     "privilege_escalation"),
    (("exploit", "weaponiz", "exploit verification", "cve"),
     "exploit validation",
     ["metasploit module", "manual PoC verification"],
     "code_execution"),
    (("persistence", "service account", "scheduled task", "cron"),
     "persistence opportunity audit",
     ["scheduled task review", "service account audit"],
     "persistence"),
]


def suggest_revival(missing_evidence: list[str]) -> list[dict]:
    """Map each missing-evidence item to a revival option (deduplicated, ordered)."""
    seen: set[tuple[str, str]] = set()
    out: list[dict] = []
    for item in missing_evidence:
        low = item.lower()
        for keywords, action, tools, capability in _RULES:
            if any(k in low for k in keywords):
                key = (item, action)
                if key in seen:
                    break
                seen.add(key)
                out.append(
                    RevivalOption(
                        missing=item,
                        action=action,
                        tools=tools,
                        expected_capability=capability,
                    ).to_dict()
                )
                break
    return out
