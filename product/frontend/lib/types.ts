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
