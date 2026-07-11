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
    OBSERVED = "OBSERVED"
    UNCONFIRMED_EXPLOITABILITY = "UNCONFIRMED EXPLOITABILITY"
    MANUAL_REVIEW = "MANUAL REVIEW"
    FALSE_POSITIVE = "FALSE POSITIVE"


class NodeType(str, Enum):
    # Core infrastructure (original)
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
    # Identity & access (Phase 2)
    ROLE = "role"
    ADMIN = "admin"
    DOMAIN = "domain"
    IAM_ROLE = "iam_role"
    SERVICE_ACCOUNT = "service_account"
    SESSION = "session"
    # Secrets & credentials (Phase 2)
    SECRET = "secret"
    API_KEY = "api_key"
    JWT = "jwt"
    SSH_KEY = "ssh_key"
    # Data & storage (Phase 2)
    STORAGE = "storage"
    RDS = "rds"
    REDIS = "redis"
    MESSAGE_QUEUE = "message_queue"
    NETWORK_SHARE = "network_share"
    # Cloud & orchestration (Phase 2)
    CLOUD_RESOURCE = "cloud_resource"
    KUBERNETES = "kubernetes"
    CONTAINER = "container"
    POD = "pod"
    INTERNAL_SERVICE = "internal_service"
    VPN = "vpn"
    # Supply chain & comms (Phase 2)
    GITHUB_REPO = "github_repo"
    CI_CD = "ci_cd"
    PIPELINE = "pipeline"
    WEBHOOK = "webhook"
    EMAIL = "email"


class GraphNode(BaseModel):
    """Typed attack-graph node.

    Every graph node carries this minimum evidence-first contract. Stored on the
    networkx graph as a flat attribute dict (see node_factory.build_node_attrs);
    specialized attributes (cvss, applicability_status, is_entry, ...) are added
    as extra keys alongside these.
    """

    label: str
    node_type: str
    evidence: list[str] = Field(default_factory=list)
    finding_ids: list[str] = Field(default_factory=list)
    confidence: int = 0
    blast_radius: int = 0
    capability: str = ""
    criticality: str = ""
    criticality_weight: float = 0.0
    source_tool: str = ""
    validation_status: str = "observed"
    evidence_tier: str = "TIER1"


class EvidenceTier(str, Enum):
    TIER1 = "TIER1"
    TIER2 = "TIER2"
    TIER3 = "TIER3"


class AttackCapability(str, Enum):
    INITIAL_ACCESS = "initial_access"
    # EXECUTION is the canonical post-access stage; CODE_EXECUTION is the
    # original alias kept for backward compatibility (treated as equivalent).
    EXECUTION = "execution"
    CODE_EXECUTION = "code_execution"
    CREDENTIAL_ACCESS = "credential_access"
    PRIVILEGE_ESCALATION = "privilege_escalation"
    LATERAL_MOVEMENT = "lateral_movement"
    PERSISTENCE = "persistence"
    DATA_ACCESS = "data_access"
    DOMAIN_COMPROMISE = "domain_compromise"


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
    port_technologies: dict[int, str] = Field(default_factory=dict)
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


class CanonicalEntity(BaseModel):
    """Normalized identity of a finding's subject.

    Built by the correlation engine so unrelated scanner terminology
    ("Apache httpd", "Apache HTTP", "Apache Server") resolves to a single
    canonical vendor/product/service. Every downstream conclusion references
    this instead of comparing raw strings.
    """

    kind: str = "service"  # service | software | vulnerability | credential | web | network | informational
    vendor: str = ""
    product: str = ""
    service: str = ""
    version: str = ""
    cpe: str = ""
    label: str = ""
    key: str = ""


class ScannerAgreement(BaseModel):
    """Automatically computed cross-scanner corroboration.

    ``agreed`` are the tools that actually reported this canonical entity;
    ``capable`` are the tools present in this investigation that *could* have
    reported it. Reported as ``agreed / capable`` — never vanity ``1 / 1``.
    """

    agreed: list[str] = Field(default_factory=list)
    capable: list[str] = Field(default_factory=list)
    ratio: float = 0.0
    label: str = ""


class VersionAgreement(BaseModel):
    """Whether scanners agree on the observed version of the entity."""

    observed: list[str] = Field(default_factory=list)
    agreed: bool = True
    canonical: str = ""
    label: str = ""


class EvidenceConflict(BaseModel):
    """A recorded contradiction between scanner observations."""

    kind: str  # severity | version | host | service
    statements: list[str] = Field(default_factory=list)
    detail: str = ""


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
    # --- Correlation engine outputs (additive; empty defaults keep the
    # exported JSON a strict superset of the prior contract). ---------------
    canonical_entity: CanonicalEntity | None = None
    scanner_agreement: ScannerAgreement | None = None
    version_agreement: VersionAgreement | None = None
    conflicts: list[EvidenceConflict] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)


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
    observation_status: str = "unknown"
    exploitability_status: str = "unknown"
    # --- Evidence-driven multi-dimensional confidence (additive). Each score
    # is 0-100 and emerges from a weighted feature vector — no base scores, no
    # hardcoded defaults. ``confidence_factors`` maps each dimension to the
    # ordered list of {label, delta, category} contributions that produced it,
    # so any UI can answer "why is this N%?" without the LLM. --------------- #
    observation_confidence: int = 0
    reliability_confidence: int = 0
    exploit_confidence: int = 0
    impact_confidence: int = 0
    overall_confidence: int = 0
    confidence_factors: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    confidence_dimensions: list[str] = Field(default_factory=list)
    supporting_evidence: list[str] = Field(default_factory=list)
    contradicting_evidence: list[str] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)
    evidence_quality: dict[str, Any] = Field(default_factory=dict)


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
    evidence_tier: str = "TIER1"
    evidence_type: str = ""
    evidence_source: str = ""
    validation_checks_passed: list[str] = Field(default_factory=list)
    exploitability: str = ""
    privilege_gained: str = ""
    confidence_proof: dict = Field(default_factory=dict)


class AttackPathNode(BaseModel):
    id: str
    label: str
    node_type: NodeType
    evidence: list[str] = Field(default_factory=list)
    source_finding_ids: list[str] = Field(default_factory=list)
    evidence_tier: str = "TIER1"
    capability: str = ""
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
    is_hypothetical: bool = False
    path_explanation: list[str] = Field(default_factory=list)
    confidence_explanation: list[str] = Field(default_factory=list)
    expected_impact: str = ""
    rejection_context: list[str] = Field(default_factory=list)
    capability_chain: list[str] = Field(default_factory=list)
    blast_radius: int = 1
    terminal_criticality: str = ""
    scoring: PathScoringBreakdown | None = None
    confidence_proof: dict = Field(default_factory=dict)
    # Phase F+G proofs (additive; all default empty so existing output is a superset).
    risk_proof: dict = Field(default_factory=dict)
    accepted_proof: dict = Field(default_factory=dict)
    rejected_proof: dict = Field(default_factory=dict)
    effort_proof: dict = Field(default_factory=dict)
    blast_proof: dict = Field(default_factory=dict)
    alternatives: list[dict] = Field(default_factory=list)
    revival_options: list[dict] = Field(default_factory=list)
    # Phase H — deterministic attack category + MITRE (additive).
    attack_category: str = ""
    attack_category_proof: dict = Field(default_factory=dict)
    mitre_tactics: list[str] = Field(default_factory=list)
    mitre_techniques: list[str] = Field(default_factory=list)
    # Phase I — deterministic attack story (populated at export; default empty).
    attack_story: dict = Field(default_factory=dict)


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
    # Phase 2 engine intelligence (additive): per-finding facts, conflicts,
    # service profile, recommendations, business impact, reasoning, timeline,
    # and evidence-graph slice. Populated by the intelligence engine; the LLM
    # only explains this structure.
    intelligence: dict[str, Any] = Field(default_factory=dict)


class InvestigationStats(BaseModel):
    findings_loaded: int = 0
    findings_correlated: int = 0
    findings_retained: int = 0
    attack_paths: int = 0
    hypothetical_paths: int = 0
    paths_explored: int = 0
    paths_rejected: int = 0
    false_positives_removed: int = 0
    confirmed: int = 0
    likely_exploitable: int = 0
    observed: int = 0
    unconfirmed_exploitability: int = 0
    validated: int = 0
    manual_review: int = 0
    analyst_hours_saved: float = 0.0
    analyst_minutes_saved: float = 0.0
    critical_count: int = 0
    unknowns_requiring_investigation: int = 0
    confidence_distribution: dict[str, int] = Field(default_factory=dict)


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
    # Phase I production layer (additive).
    attack_surface_score: int = 0
    attack_surface_classification: str = ""
    attack_surface_proof: dict = Field(default_factory=dict)
    graph_proof: dict = Field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")
