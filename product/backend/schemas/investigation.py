"""Pydantic API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AnalyzeResponse(BaseModel):
    investigation_id: str
    status: str


class AttackSurfaceSummary(BaseModel):
    score: int
    classification: str


class AttackPathSummary(BaseModel):
    id: str
    stable_id: str = ""
    confidence: int
    risk: float
    category: str
    title: str = ""
    blast_radius: int = 0
    mitre_tactics: list[str] = Field(default_factory=list)


class InvestigationSummary(BaseModel):
    id: str
    name: str
    created_at: datetime
    status: str
    attack_surface_score: int
    attack_surface_classification: str
    path_count: int
    critical_count: int


class InvestigationListItem(InvestigationSummary):
    target: str = ""
    duration_seconds: float = 0.0
    findings_retained: int = 0
    avg_confidence: int | None = None
    summary: str = ""
    source_filename: str = ""
    updated_at: datetime | None = None


class InvestigationListResponse(BaseModel):
    investigations: list[InvestigationListItem] = Field(default_factory=list)


class InvestigationDetail(BaseModel):
    summary: InvestigationSummary
    attack_surface: AttackSurfaceSummary
    attack_paths: list[AttackPathSummary]


class GraphResponse(BaseModel):
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    attack_paths: list[dict[str, Any]] = Field(default_factory=list)
    statistics: dict[str, Any] = Field(default_factory=dict)


class InvestigationStats(BaseModel):
    findings_loaded: int = 0
    findings_correlated: int = 0
    findings_retained: int = 0
    attack_paths: int = 0
    false_positives_removed: int = 0
    confirmed: int = 0
    likely_exploitable: int = 0
    observed: int = 0
    critical_count: int = 0
    confidence_distribution: dict[str, int] = Field(default_factory=dict)


class InvestigationReportView(BaseModel):
    name: str = ""
    target: str = ""
    duration_seconds: float = 0.0
    stats: InvestigationStats = Field(default_factory=InvestigationStats)
    attack_surface_score: int = 0
    attack_surface_classification: str = ""
    attack_surface_proof: dict[str, Any] = Field(default_factory=dict)
    graph_proof: dict[str, Any] = Field(default_factory=dict)
    assets: list[dict[str, Any]] = Field(default_factory=list)
    discovered_assets: list[dict[str, Any]] = Field(default_factory=list)


class FindingsResponse(BaseModel):
    validated: list[dict[str, Any]] = Field(default_factory=list)
    rejected: list[dict[str, Any]] = Field(default_factory=list)


class RemediationResponse(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list)
    total_items: int = 0


class PathDetail(BaseModel):
    id: str
    investigation_id: str
    stable_id: str = ""
    confidence: dict[str, Any] = Field(default_factory=dict)
    risk: dict[str, Any] = Field(default_factory=dict)
    proof: dict[str, Any] = Field(default_factory=dict)
    story: dict[str, Any] = Field(default_factory=dict)
    mitre: list[str] = Field(default_factory=list)
    mitre_tactics: list[str] = Field(default_factory=list)
    mitre_techniques: list[str] = Field(default_factory=list)
    category: str = ""
    title: str = ""
    blast_radius: int = 0
    attacker_effort: str = ""
    capability_chain: list[str] = Field(default_factory=list)
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
