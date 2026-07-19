/** Engine output types — mirrors VAYNE export JSON verbatim. */

export interface ProofFactor {
  name: string;
  weight?: number;
  evidence?: string[];
  contribution?: number;
}

export interface ProofBundle {
  formula?: string;
  factors?: ProofFactor[];
  raw_score?: number;
  normalized_score?: number;
  explanation?: string[];
}

export interface AttackStory {
  initial_foothold?: string;
  exploitation_step?: string;
  privilege_gained?: string;
  lateral_movement?: string;
  target_reached?: string;
  business_impact?: string;
  narrative?: string;
}

export interface AttackPathSummary {
  id: string;
  stable_id: string;
  confidence: number;
  risk: number;
  category: string;
  title: string;
  blast_radius: number;
  mitre_tactics: string[];
}

export interface InvestigationSummary {
  id: string;
  name: string;
  created_at: string;
  status: string;
  attack_surface_score: number;
  attack_surface_classification: string;
  path_count: number;
  critical_count: number;
}

export interface InvestigationListItem extends InvestigationSummary {
  target: string;
  duration_seconds: number;
  findings_retained: number;
  avg_confidence: number | null;
  summary?: string;
  source_filename?: string;
  updated_at?: string;
}

export interface InvestigationDetail {
  summary: InvestigationSummary;
  attack_surface: { score: number; classification: string };
  attack_paths: AttackPathSummary[];
}

export interface InvestigationStats {
  findings_loaded: number;
  findings_correlated: number;
  findings_retained: number;
  attack_paths: number;
  false_positives_removed: number;
  confirmed: number;
  likely_exploitable: number;
  observed: number;
  critical_count: number;
  confidence_distribution: Record<string, number>;
  paths_rejected?: number;
  paths_explored?: number;
  hypothetical_paths?: number;
  unknowns_requiring_investigation?: number;
}

export interface InvestigationReport {
  name: string;
  target: string;
  duration_seconds: number;
  stats: InvestigationStats;
  attack_surface_score: number;
  attack_surface_classification: string;
  attack_surface_proof: {
    score?: number;
    classification?: string;
    factors?: ProofFactor[];
    formula?: string;
  };
  graph_proof: Record<string, unknown>;
  assets: Array<Record<string, unknown>>;
  discovered_assets: Array<Record<string, unknown>>;
}

export interface PathDetail {
  id: string;
  investigation_id: string;
  stable_id: string;
  confidence: { score: number; proof: ProofBundle };
  risk: { score: number; proof: ProofBundle };
  proof: {
    accepted: Record<string, unknown>;
    category: Record<string, unknown>;
  };
  story: AttackStory;
  mitre: string[];
  mitre_tactics: string[];
  mitre_techniques: string[];
  category: string;
  title: string;
  blast_radius: number;
  attacker_effort: string;
  capability_chain: string[];
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  confidence?: number;
  risk?: number;
  criticality?: string;
  blast_radius?: number;
  category?: string;
  mitre?: string[];
  evidence?: string[];
  finding_ids?: string[];
  group?: string;
  position_hint?: { layer: number; index: number; x_hint: number; y_hint: number };
}

export interface GraphEdge {
  source: string;
  target: string;
  confidence?: number;
  relationship?: string;
  proof?: ProofBundle;
  category?: string;
  evidence?: string[];
  evidence_tier?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  attack_paths: Array<Record<string, unknown>>;
  statistics: Record<string, unknown>;
}

export interface Finding {
  id?: string;
  title?: string;
  host?: string;
  classification?: string;
  confidence?: number;
  evidence?: string[];
  reasoning?: string[];
  cve?: string;
}

export interface FindingsData {
  validated: Finding[];
  rejected: Finding[];
}

export interface RemediationItem {
  match_key: string;
  fix: string;
  difficulty: string;
  expected_risk_reduction: number;
  expected_confidence_reduction: number;
  affected_attack_paths: string[];
}

export interface RemediationData {
  items: RemediationItem[];
  total_items: number;
}

export interface WorkbenchPipelineStage {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
  offset_ms: number;
}

export interface WorkbenchEvidenceSource {
  tool: string;
  label: string;
  status: string;
  objects: number;
  findings: number;
  retained: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  note: string;
}

export interface WorkbenchCorrelation {
  subject: string;
  host: string;
  cve: string;
  sources: string[];
  confidence: number;
  retained: boolean;
  base_confidence?: number;
  final_confidence?: number;
  consensus?: string;
}

export interface WorkbenchConfirmedFinding {
  id: string;
  title: string;
  host: string;
  severity: string;
  classification: string;
  status: "Observed" | "Correlated" | "Hypothesized" | "Validated" | "Rejected";
  /** Primary decision-relevant score among displayed semantic metrics. */
  machine_confidence: number;
  analyst_confidence: string;
  sources: string[];
  source_file?: string;
  reasoning: string[];
  evidence: string[];
  proof?: WorkbenchProofItem[];
  /** Semantic confidence model — observation / correlation / exploit. */
  confidence?: WorkbenchSemanticConfidence;
  /** @deprecated Prefer confidence.observation.factors */
  confidence_factors?: WorkbenchConfidenceFactor[];
  base_confidence?: number;
  final_confidence?: number;
  scanner_agreement?: WorkbenchScannerAgreement;
  why_it_matters: string;
  business_impact: string;
  business_impact_detail?: WorkbenchBusinessImpact;
  cve: string;
  validated_checks: string[];
  not_validated_checks: string[];
  unique_reason?: string;
  evidence_summary?: WorkbenchEvidenceSummary;
  /** Phase 3/4 autonomous investigation for this finding (source of truth). */
  investigation?: WorkbenchFindingInvestigation;
  confidence_timeline?: WorkbenchConfidenceEvolution[];
}

/** Phase 4 ground-truth validation loop for a single finding. */
export interface WorkbenchValidationLoop {
  exploit_confirmed: boolean;
  confidence_delta: number;
  reason: string;
  open_probe_count?: number;
  verification?: {
    strength: number;
    label: string;
    method: string;
    authenticated: boolean;
    reproduced: boolean;
    provenance?: string[];
  };
  next_probes?: Array<{
    name: string;
    method: string;
    confirms: string;
    expected_gain: number;
    steps?: string[];
  }>;
}

export interface WorkbenchInvestigationDimension {
  score: number;
  reasoning: string;
  verified?: boolean;
}

export interface WorkbenchFindingHypothesis {
  label: string;
  probability: number;
  category: string;
  rationale?: string;
  supporting_evidence?: string[];
  contradicting_evidence?: string[];
}

export interface WorkbenchSelfChallenge {
  challenges?: Array<{
    question?: string;
    answer?: string;
    weakens?: boolean;
    confidence_effect?: number;
  }>;
  what_would_overturn?: string[];
  verdict?: string;
  net_confidence_effect?: number;
}

export interface WorkbenchInvestigationStage {
  label: string;
  detail?: string;
  complete?: boolean;
}

export interface WorkbenchInvestigationTask {
  action: string;
  detail?: string;
  expected_result?: string;
  expected_gain?: number;
}

export interface WorkbenchConfidenceEvolution {
  event: string;
  confidence?: number;
  delta?: number;
  detail?: string;
  kind?: string;
}

/** Subset of the engine's per-finding investigation the workbench renders. */
export interface WorkbenchFindingInvestigation {
  conclusion?: string;
  human_reasoning?: string[];
  stages?: WorkbenchInvestigationStage[];
  confidence_evolution?: WorkbenchConfidenceEvolution[];
  self_challenge?: WorkbenchSelfChallenge;
  investigation_tasks?: WorkbenchInvestigationTask[];
  validation_loop?: WorkbenchValidationLoop;
  investigation_confidence?: Record<string, WorkbenchInvestigationDimension>;
  hypotheses?: WorkbenchFindingHypothesis[];
  attack_story?: Record<string, string>;
}

export type WorkbenchConfidenceKind =
  | "informational"
  | "service_observation"
  | "correlated_vulnerability"
  | "validated_exposure";

export type WorkbenchConfidenceMetricKey = "observation" | "correlation" | "exploit";

export interface WorkbenchConfidenceMetric {
  score: number;
  factors: WorkbenchConfidenceFactor[];
  question: string;
}

export interface WorkbenchSemanticConfidence {
  kind: WorkbenchConfidenceKind;
  observation: WorkbenchConfidenceMetric;
  correlation: WorkbenchConfidenceMetric | null;
  exploit: WorkbenchConfidenceMetric | null;
  /** Which metrics are analytically meaningful to display. */
  display: WorkbenchConfidenceMetricKey[];
  primary: {
    metric: WorkbenchConfidenceMetricKey;
    score: number;
  };
  features?: WorkbenchConfidenceFactor[];
  evidence_summary?: WorkbenchEvidenceSummary;
  scanner_agreement?: WorkbenchScannerAgreement;
}

export interface WorkbenchProofItem {
  source: string;
  detail: string;
}

export interface WorkbenchConfidenceFactor {
  label: string;
  delta: number;
}

export interface WorkbenchScannerAgreement {
  agreed: string[];
  capable?: string[];
  total: number;
  ratio: string;
}

export interface WorkbenchEvidenceSummary {
  scanners: number;
  capable_scanners: number;
  independent_observations: number;
  conflicts: number;
  canonical_entity: string;
  version_confidence: number;
  version?: string;
  cpe?: string;
  category?: string;
}

export interface WorkbenchBusinessImpact {
  attacker_gains: string;
  systems_exposed: string;
  process_affected: string;
  importance: string;
  summary: string;
}

export interface WorkbenchHypothesis {
  title: string;
  status: string;
  reason: string;
  current_evidence: string;
  required_validation: string;
  confidence: number;
}

export interface WorkbenchConflictStatement {
  source: string;
  claim: string;
}

export interface WorkbenchConflict {
  subject: string;
  host: string;
  statements: WorkbenchConflictStatement[];
  explanation: string;
}

export interface WorkbenchProvenanceSupport {
  source: string;
  evidence: string;
}

export interface WorkbenchProvenance {
  claim: string;
  supports: WorkbenchProvenanceSupport[];
}

export interface WorkbenchUnknown {
  topic: string;
  reason: string;
  evidence_needed: string;
  expected_gain?: number;
}

export interface WorkbenchEvidenceTrailEvent {
  time: string;
  event: string;
  detail: string;
  kind: string;
}

export interface WorkbenchTimelineStep {
  event: string;
  detail: string;
  kind: string;
}

export interface WorkbenchCandidatePath {
  steps: string[];
  status: "VALIDATED" | "REJECTED";
  confidence: number;
  risk: number;
  reason: string;
  missing: string[];
  tools_that_help: string[];
}

export interface WorkbenchStat {
  label: string;
  value: string | number;
}

export interface WorkbenchFileContribution {
  file: string;
  tool: string;
  findings: number;
  retained: number;
  rejected: number;
  signals: number;
  hosts: number;
}

export interface WorkbenchNotes {
  evidence: string;
  correlation: string;
  paths: string;
  summary: string;
}

export interface WorkbenchData {
  generated_at: string;
  duration_seconds: number;
  pipeline: WorkbenchPipelineStage[];
  evidence_sources: WorkbenchEvidenceSource[];
  correlations: WorkbenchCorrelation[];
  candidate_paths: WorkbenchCandidatePath[];
  statistics: WorkbenchStat[];
  file_contributions: WorkbenchFileContribution[];
  notes: WorkbenchNotes;
  executive_summary: string;
  confirmed_findings: WorkbenchConfirmedFinding[];
  hypotheses: WorkbenchHypothesis[];
  conflicts: WorkbenchConflict[];
  unknowns: (string | WorkbenchUnknown)[];
  missing_evidence?: WorkbenchUnknown[];
  next_actions: string[];
  provenance: WorkbenchProvenance[];
  evidence_trail?: WorkbenchEvidenceTrailEvent[];
  investigation_timeline?: WorkbenchTimelineStep[];
  closing_line: string;
  totals: {
    files: number;
    sources: number;
    validated_paths: number;
    rejected_paths: number;
    cross_source_matches: number;
    confirmed_findings?: number;
  };
}
