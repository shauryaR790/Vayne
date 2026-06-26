"""Core domain models for VAYNE."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

UNKNOWN = "UNKNOWN — insufficient evidence"


class Classification(str, Enum):
    CONFIRMED = "CONFIRMED"
    LIKELY_EXPLOITABLE = "LIKELY EXPLOITABLE"
    MANUAL_REVIEW = "MANUAL REVIEW"
    FALSE_POSITIVE = "FALSE POSITIVE"


class NodeType(str, Enum):
    ENDPOINT = "endpoint"
    ASSET = "asset"
    SERVICE = "service"
    SOFTWARE = "software"
    VULNERABILITY = "vulnerability"
    IDENTITY = "identity"
    CREDENTIAL = "credential"
    BUCKET = "bucket"
    DATABASE = "database"
    DATA = "data"


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


class AssetService(BaseModel):
    port: int
    protocol: str = "tcp"
    software: str = ""
    version: str = ""


class DiscoveredAsset(BaseModel):
    hostname: str
    ip: str = ""
    services: list[AssetService] = Field(default_factory=list)
    vulnerabilities: list[str] = Field(default_factory=list)
    credentials: list[str] = Field(default_factory=list)
    identities: list[str] = Field(default_factory=list)
    data: list[str] = Field(default_factory=list)
    exposures: list[str] = Field(default_factory=list)


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


class ValidationResult(BaseModel):
    host_alive: bool = False
    port_open: bool = False
    service_exists: bool = False
    service_fingerprinted: bool = False
    version_matches: bool = False
    cve_applicable: bool = False
    auth_required: bool = False
    prerequisites_met: bool = False
    reachable: bool = False
    reproducible: bool = False
    privilege_escalation_possible: bool = False
    lateral_movement_possible: bool = False
    confidence: int = 0
    confidence_breakdown: list[str] = Field(default_factory=list)
    reasoning: list[str] = Field(default_factory=list)
    classification: Classification = Classification.MANUAL_REVIEW


class AttackPathEdge(BaseModel):
    edge_id: str = ""
    source_id: str
    target_id: str
    relationship: str
    confidence: int
    confidence_contribution: int = 0
    confidence_breakdown: list[str] = Field(default_factory=list)
    evidence: str
    source_finding_id: str = ""
    source_tool: str = ""
    discovered_from: list[str] = Field(default_factory=list)
    artifact_type: str = ""
    validation_checks_passed: list[str] = Field(default_factory=list)
    exploitability: str = ""
    privilege_gained: str = ""


class AttackPathNode(BaseModel):
    id: str
    label: str
    node_type: NodeType
    evidence: list[str] = Field(default_factory=list)
    source_finding_ids: list[str] = Field(default_factory=list)
    risk_level: str = ""


class PathScoringBreakdown(BaseModel):
    confidence_formula: str = ""
    confidence_calculation: str = ""
    edge_confidence_formula: str = ""
    attacker_effort_formula: str = ""
    attacker_effort_calculation: str = ""
    risk_score_formula: str = ""
    risk_score_calculation: str = ""


class AttackPath(BaseModel):
    id: str
    title: str
    nodes: list[AttackPathNode]
    edges: list[AttackPathEdge] = Field(default_factory=list)
    risk_score: float = 0.0
    exploitability: float = 0.0
    complexity: str = ""
    attacker_effort: str = ""
    confidence: int = 0
    hop_count: int = 0
    termination_message: str = ""
    missing_evidence: list[str] = Field(default_factory=list)
    scoring: PathScoringBreakdown | None = None


class AnalystBrief(BaseModel):
    root_cause: str = UNKNOWN
    impact_assessment: str = UNKNOWN
    attack_scenario: str = UNKNOWN
    exploitability: str = UNKNOWN
    prerequisites: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    why_this_matters: str = UNKNOWN
    confidence: int = 0
    likely_attacker_actions: list[str] = Field(default_factory=list)
    remediation_summary: str = UNKNOWN


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
    findings_retained: int = 0
    attack_paths: int = 0
    false_positives_removed: int = 0
    confirmed: int = 0
    likely_exploitable: int = 0
    validated: int = 0
    manual_review: int = 0
    analyst_hours_saved: float = 0.0
    critical_count: int = 0


class InvestigationReport(BaseModel):
    name: str
    target: str
    duration_seconds: float = 0.0
    stats: InvestigationStats
    assets: list[Asset] = Field(default_factory=list)
    discovered_assets: list[DiscoveredAsset] = Field(default_factory=list)
    findings: list[InvestigatedFinding] = Field(default_factory=list)
    attack_paths: list[AttackPath] = Field(default_factory=list)
    thinking_log: list[str] = Field(default_factory=list)
    proof_log: list[str] = Field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")
