"""Pydantic models for the VAYNE validation pipeline."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class Classification(str, Enum):
    CONFIRMED = "confirmed"
    LIKELY_EXPLOITABLE = "likely exploitable"
    MANUAL_REVIEW = "requires manual review"
    PROBABLE_FALSE_POSITIVE = "probable false positive"


class RawFinding(BaseModel):
    """Normalized finding from any scanner tool."""

    id: str
    tool: str
    host: str
    port: str = ""
    service: str = ""
    version: str = ""
    finding: str
    severity: str = "info"
    evidence: str = ""


class CorrelatedFinding(BaseModel):
    """Finding merged from multiple scanner sources."""

    id: str
    finding: str
    host: str
    port: str = ""
    service: str = ""
    version: str = ""
    severity: str = "info"
    confidence: int = 0
    sources: list[str] = Field(default_factory=list)
    raw_findings: list[RawFinding] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)


class ValidationResult(BaseModel):
    validated: bool = False
    confidence: int = 0
    reasoning: list[str] = Field(default_factory=list)
    host_alive: bool | None = None
    port_reachable: bool | None = None
    service_confirmed: bool | None = None
    version_confirmed: bool | None = None
    auth_required: bool | None = None
    prerequisites_met: bool | None = None
    exploitation_possible: bool | None = None
    likely_false_positive: bool = False


class ExploitabilityScore(BaseModel):
    exploitability: float = 0.0
    business_impact: str = "low"
    confidence: int = 0
    estimated_time_to_exploit: str = "unknown"


class AnalystReport(BaseModel):
    why_it_matters: str = ""
    why_validated: str = ""
    why_rejected: str = ""
    attack_preconditions: list[str] = Field(default_factory=list)
    business_impact: str = ""
    remediation_steps: list[str] = Field(default_factory=list)


class AnalyzedFinding(BaseModel):
    correlated: CorrelatedFinding
    validation: ValidationResult
    classification: Classification
    score: ExploitabilityScore
    analyst: AnalystReport
    status_label: str = ""


class InvestigationStats(BaseModel):
    loaded: int = 0
    validated: int = 0
    likely_exploitable: int = 0
    false_positives: int = 0
    manual_review: int = 0
    critical: int = 0
    analyst_hours_saved: float = 0.0


class InvestigationReport(BaseModel):
    name: str
    target: str
    duration_seconds: float = 0.0
    stats: InvestigationStats
    findings: list[AnalyzedFinding] = Field(default_factory=list)

    def to_summary_dict(self) -> dict[str, Any]:
        return {
            "investigation": self.name,
            "target": self.target,
            "duration": f"{self.duration_seconds:.0f}s",
            "stats": self.stats.model_dump(),
        }
