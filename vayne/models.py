"""Core domain models for VAYNE."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class Classification(str, Enum):
    CONFIRMED = "CONFIRMED"
    LIKELY_EXPLOITABLE = "LIKELY EXPLOITABLE"
    MANUAL_REVIEW = "MANUAL REVIEW"
    FALSE_POSITIVE = "FALSE POSITIVE"


class Finding(BaseModel):
    id: str
    host: str
    service: str = ""
    port: int | None = None
    severity: str = "info"
    cve: str = ""
    cwe: str = ""
    title: str
    description: str = ""
    evidence: str = ""
    confidence: int = 50
    source_tool: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Asset(BaseModel):
    host: str
    ip: str = ""
    technologies: list[str] = Field(default_factory=list)
    ports: list[int] = Field(default_factory=list)
    services: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class CorrelatedFinding(BaseModel):
    id: str
    title: str
    host: str
    service: str = ""
    port: int | None = None
    severity: str = "info"
    cve: str = ""
    cwe: str = ""
    description: str = ""
    evidence: list[str] = Field(default_factory=list)
    confidence: int = 0
    sources: list[str] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class ValidationResult(BaseModel):
    host_alive: bool = False
    port_open: bool = False
    service_exists: bool = False
    version_matches: bool = False
    cve_applicable: bool = False
    auth_required: bool = False
    prerequisites_met: bool = False
    reachable: bool = False
    reproducible: bool = False
    confidence: int = 0
    reasoning: list[str] = Field(default_factory=list)
    classification: Classification = Classification.MANUAL_REVIEW


class AttackPathNode(BaseModel):
    id: str
    label: str
    asset_type: str = ""
    risk_level: str = "medium"


class AttackPath(BaseModel):
    id: str
    title: str
    nodes: list[AttackPathNode]
    risk_score: float = 0.0
    exploitability: float = 0.0
    complexity: str = "medium"
    blast_radius: str = ""
    exploit_time: str = ""
    confidence: int = 0
    edge_labels: list[str] = Field(default_factory=list)


class AnalystBrief(BaseModel):
    root_cause: str = ""
    business_impact: str = ""
    attack_scenario: str = ""
    exploitability: str = ""
    prerequisites: list[str] = Field(default_factory=list)
    why_this_matters: str = ""
    confidence: int = 0
    likely_attacker_actions: list[str] = Field(default_factory=list)
    remediation_summary: str = ""


class RemediationTimeline(BaseModel):
    immediate: list[str] = Field(default_factory=list)
    hours_24: list[str] = Field(default_factory=list)
    hours_72: list[str] = Field(default_factory=list)
    week_1: list[str] = Field(default_factory=list)
    long_term: list[str] = Field(default_factory=list)


class InvestigatedFinding(BaseModel):
    correlated: CorrelatedFinding
    validation: ValidationResult
    analyst: AnalystBrief
    remediation: RemediationTimeline
    exploitability_score: float = 0.0


class InvestigationStats(BaseModel):
    findings_loaded: int = 0
    findings_correlated: int = 0
    attack_paths: int = 0
    false_positives_removed: int = 0
    confirmed: int = 0
    likely_exploitable: int = 0
    manual_review: int = 0
    analyst_hours_saved: float = 0.0
    critical_count: int = 0


class InvestigationReport(BaseModel):
    name: str
    target: str
    duration_seconds: float = 0.0
    stats: InvestigationStats
    assets: list[Asset] = Field(default_factory=list)
    findings: list[InvestigatedFinding] = Field(default_factory=list)
    attack_paths: list[AttackPath] = Field(default_factory=list)
    thinking_log: list[str] = Field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")
