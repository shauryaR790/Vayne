"""Deterministic attack-path categories (Phase H).

Categories are assigned by structural graph signatures only — never by LLM,
ML, probabilistic scoring, or free-text keyword matching.
"""

from __future__ import annotations

from enum import Enum


class AttackCategory(str, Enum):
    REMOTE_RCE = "remote_rce"
    CREDENTIAL_ATTACK = "credential_attack"
    PRIVILEGE_ESCALATION = "privilege_escalation"
    LATERAL_MOVEMENT = "lateral_movement"
    CLOUD_ATTACK = "cloud_attack"
    IDENTITY_ATTACK = "identity_attack"
    CONTAINER_ESCAPE = "container_escape"
    DOMAIN_COMPROMISE = "domain_compromise"
    DATA_EXFILTRATION = "data_exfiltration"
    SUPPLY_CHAIN = "supply_chain"
    UNKNOWN = "unknown"
