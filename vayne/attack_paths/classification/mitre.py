"""Deterministic MITRE ATT&CK mappings (Phase H).

Each category maps to fixed tactic and technique IDs. No inference — lookup only.
"""

from __future__ import annotations

from vayne.models.attack_categories import AttackCategory

# Tactic IDs (enterprise)
_TA = {
    "TA0001": "TA0001 Initial Access",
    "TA0002": "TA0002 Execution",
    "TA0003": "TA0003 Persistence",
    "TA0004": "TA0004 Privilege Escalation",
    "TA0006": "TA0006 Credential Access",
    "TA0008": "TA0008 Lateral Movement",
    "TA0010": "TA0010 Exfiltration",
}

CATEGORY_TACTICS: dict[AttackCategory, tuple[str, ...]] = {
    AttackCategory.REMOTE_RCE: (_TA["TA0001"], _TA["TA0002"]),
    AttackCategory.CREDENTIAL_ATTACK: (_TA["TA0006"],),
    AttackCategory.PRIVILEGE_ESCALATION: (_TA["TA0004"],),
    AttackCategory.LATERAL_MOVEMENT: (_TA["TA0008"],),
    AttackCategory.DATA_EXFILTRATION: (_TA["TA0010"],),
    AttackCategory.DOMAIN_COMPROMISE: (_TA["TA0004"], _TA["TA0008"], _TA["TA0006"]),
    AttackCategory.CLOUD_ATTACK: (_TA["TA0003"], _TA["TA0004"], _TA["TA0008"]),
    AttackCategory.IDENTITY_ATTACK: (_TA["TA0004"], _TA["TA0006"]),
    AttackCategory.CONTAINER_ESCAPE: (_TA["TA0004"], _TA["TA0002"]),
    AttackCategory.SUPPLY_CHAIN: (_TA["TA0001"], _TA["TA0003"]),
    AttackCategory.UNKNOWN: (),
}

# Technique IDs — fixed per category (deterministic subset, not scored).
CATEGORY_TECHNIQUES: dict[AttackCategory, tuple[str, ...]] = {
    AttackCategory.REMOTE_RCE: (
        "T1190 Exploit Public-Facing Application",
        "T1059 Command and Scripting Interpreter",
    ),
    AttackCategory.CREDENTIAL_ATTACK: (
        "T1552 Unsecured Credentials",
        "T1078 Valid Accounts",
    ),
    AttackCategory.PRIVILEGE_ESCALATION: (
        "T1068 Exploitation for Privilege Escalation",
        "T1548 Abuse Elevation Control Mechanism",
    ),
    AttackCategory.LATERAL_MOVEMENT: (
        "T1021 Remote Services",
        "T1550 Use Alternate Authentication Material",
    ),
    AttackCategory.DATA_EXFILTRATION: (
        "T1005 Data from Local System",
        "T1530 Data from Cloud Storage",
    ),
    AttackCategory.DOMAIN_COMPROMISE: (
        "T1078.002 Domain Accounts",
        "T1484 Domain Policy Modification",
    ),
    AttackCategory.CLOUD_ATTACK: (
        "T1078.004 Cloud Accounts",
        "T1098 Account Manipulation",
        "T1552.005 Cloud Credentials",
    ),
    AttackCategory.IDENTITY_ATTACK: (
        "T1078 Valid Accounts",
        "T1098 Account Manipulation",
    ),
    AttackCategory.CONTAINER_ESCAPE: (
        "T1611 Escape to Host",
        "T1610 Deploy Container",
    ),
    AttackCategory.SUPPLY_CHAIN: (
        "T1195 Supply Chain Compromise",
        "T1608 Stage Capabilities",
    ),
    AttackCategory.UNKNOWN: (),
}


def mitre_for_category(category: AttackCategory) -> tuple[list[str], list[str]]:
    return (
        list(CATEGORY_TACTICS.get(category, ())),
        list(CATEGORY_TECHNIQUES.get(category, ())),
    )
