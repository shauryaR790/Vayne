import type { InvestigationBundle } from "./investigation-bundle";
import type { InvestigationPresentation } from "./investigation-presentation";
import {
  investigationBusinessImpact,
  investigationConfidenceNote,
  investigationReason,
  isInternalScoringText,
  sanitizeAnalystText,
} from "./analyst-display";
import type {
  WorkbenchData,
  WorkbenchPriorityItem,
} from "./types";
import { recommendationTasks } from "./workbench-report-helpers";

export type PriorityTier = "Critical" | "High" | "Medium" | "Low";

export interface PrioritizedInvestigation {
  id: string;
  tier: PriorityTier;
  rank?: number;
  title: string;
  reason: string;
  riskScore: number;
  estimatedReviewMinutes: number;
  priorityReasons: string[];
  rankingExplanation?: string;
  evidenceCount: number;
  confidence: number;
  claimStatus: string;
  businessImpact: string;
  confidenceExplanation: string;
  immediateAction: string;
  evidenceSources: string[];
  affectedAssets: string[];
  affectedIdentities: string[];
  evidenceItems: string[];
  missingEvidence: string[];
  alternativeExplanations: string[];
  analystTasks: Array<{ action: string; why: string; priority: string }>;
  detailSectionId: string;
}

export interface ExecutiveInvestigationOverview {
  executiveSummary: string[];
  prioritizedInvestigations: PrioritizedInvestigation[];
  statistics: Array<{ label: string; value: string | number }>;
  keyObservations: string[];
  recommendedActions: string[];
  auditComplete?: boolean;
  unsupportedClaimsBlocked?: number;
}

function statValue(workbench: WorkbenchData, label: string): string | number {
  const row = workbench.statistics.find((s) => s.label === label);
  return row?.value ?? "—";
}

function mapPriorityItem(item: WorkbenchPriorityItem): PrioritizedInvestigation {
  const rankedBullets = item.why_ranked_here?.bullets ?? [];
  const reasons = rankedBullets.length
    ? rankedBullets.filter((r) => !isInternalScoringText(r))
    : (item.priority_reasons || []).filter((r) => !isInternalScoringText(r));
  const fallbackReasons = reasons.length ? reasons : ["Retained for analyst review."];
  const riskScore = item.risk ?? item.risk_score;
  return {
    id: item.id,
    tier: item.tier,
    rank: item.rank,
    title: sanitizeAnalystText(item.title, item.title),
    reason: investigationReason(item),
    riskScore,
    estimatedReviewMinutes: item.estimated_review_minutes,
    priorityReasons: fallbackReasons,
    rankingExplanation: item.ranking_explanation || item.why_ranked_here?.headline,
    evidenceCount: item.evidence_count,
    confidence: item.confidence,
    claimStatus: item.claim_status,
    businessImpact: investigationBusinessImpact(item),
    confidenceExplanation: investigationConfidenceNote(item),
    immediateAction: sanitizeAnalystText(
      item.immediate_action || item.immediate_analyst_actions?.[0] || item.next_best_actions?.[0] || "",
      fallbackReasons[0],
    ),
    evidenceSources: item.evidence_sources ?? [],
    affectedAssets: item.affected_assets ?? [],
    affectedIdentities: item.affected_identities ?? [],
    evidenceItems: item.evidence_items ?? [],
    missingEvidence: item.missing_evidence ?? [],
    alternativeExplanations: item.alternative_explanations ?? [],
    analystTasks: item.analyst_tasks ?? [],
    detailSectionId: item.detail_section_id,
  };
}

export function buildPrioritizedInvestigations(workbench: WorkbenchData): PrioritizedInvestigation[] {
  const INTERNAL =
    /false fingerprint|not applicable|not exploitable|missing preconditions|validate hypothesis in controlled/i;
  const queue = workbench.investigations?.length
    ? workbench.investigations
    : workbench.priority_queue;
  if (!queue?.length) return [];
  return queue
    .filter((item) => item.cluster_type !== "hypothesis" && !String(item.id || "").startsWith("hyp:"))
    .map(mapPriorityItem)
    .filter((item) => !INTERNAL.test(item.title));
}

function buildExecutiveSummarySentences(
  workbench: WorkbenchData,
  prioritized: PrioritizedInvestigation[],
): string[] {
  const metrics = workbench.executive_metrics;
  const files = metrics?.files ?? workbench.totals.files ?? Number(statValue(workbench, "Files Parsed")) ?? 0;
  const signals = metrics?.findings_raw ?? Number(statValue(workbench, "Evidence Signals")) ?? 0;
  const duplicates = metrics?.duplicates_removed ?? Number(statValue(workbench, "Duplicate Findings Removed")) ?? 0;
  const retained = metrics?.findings_retained ?? workbench.totals.confirmed_findings ?? workbench.confirmed_findings.length;
  const reviewCount = metrics?.investigations ?? (prioritized.length || retained);
  const immediate = metrics?.require_attention ?? prioritized.filter((p) => p.tier === "Critical" || p.tier === "High").length;

  const sentences: string[] = [];

  if (files > 0 && signals > 0) {
    sentences.push(
      `${files} scan file${files === 1 ? "" : "s"} containing approximately ${signals.toLocaleString()} raw findings were analyzed.`,
    );
  } else if (files > 0) {
    sentences.push(`${files} evidence file${files === 1 ? "" : "s"} were analyzed.`);
  } else {
    sentences.push("Uploaded evidence was analyzed across the in-scope environment.");
  }

  if (duplicates > 0) {
    sentences.push(
      `${duplicates.toLocaleString()} duplicate finding${duplicates === 1 ? "" : "s"} were merged before review.`,
    );
  }

  sentences.push(
    `${reviewCount} investigation${reviewCount === 1 ? "" : "s"} require analyst review (ranked by evidence, not scanner noise).`,
  );

  if (immediate > 0) {
    sentences.push(
      `${immediate} investigation${immediate === 1 ? " has" : "s have"} immediate priority based on validated evidence signals.`,
    );
  } else {
    sentences.push("No investigation currently meets immediate business-risk thresholds from validated evidence.");
  }

  const audit = workbench.investigation_audit;
  if (audit && audit.unsupported_claims_blocked > 0) {
    sentences.push(
      `${audit.unsupported_claims_blocked} finding${audit.unsupported_claims_blocked === 1 ? "" : "s"} flagged by self-review — treat as needs validation.`,
    );
  }

  if (workbench.executive_summary && sentences.length < 5) {
    const first = workbench.executive_summary.split(/(?<=[.!?])\s+/)[0]?.trim();
    if (first) sentences.push(first);
  }

  return sentences.filter(Boolean).slice(0, 6);
}

function buildStatistics(workbench: WorkbenchData, presentation: InvestigationPresentation) {
  const panel = workbench.summary_panel;
  if (panel) {
    const hours =
      panel.estimated_analyst_hours_saved > 0
        ? `${panel.estimated_analyst_hours_saved}h`
        : "—";
    return [
      { label: "Files uploaded", value: panel.files_uploaded },
      { label: "Investigations generated", value: panel.investigations_generated },
      { label: "Evidence signals", value: panel.evidence_signals },
      { label: "Duplicate findings removed", value: panel.duplicate_findings_removed },
      {
        label: "Investigations requiring immediate review",
        value: panel.investigations_requiring_immediate_review,
      },
      { label: "Estimated analyst hours saved", value: hours },
    ];
  }

  const metrics = workbench.executive_metrics;
  const files = metrics?.files ?? workbench.totals.files ?? statValue(workbench, "Files Parsed");
  const assets = metrics?.assets ?? statValue(workbench, "Assets");
  const uniqueVulns = metrics?.findings_retained ?? statValue(workbench, "Validated Findings");
  const duplicates = metrics?.duplicates_removed ?? statValue(workbench, "Duplicate Findings Removed");
  const highRiskPaths = metrics?.validated_paths ?? workbench.totals.validated_paths ?? presentation.executive.attackPaths;
  const hoursSaved = metrics?.analyst_hours_saved
    ? `${metrics.analyst_hours_saved}h`
    : statValue(workbench, "Analyst Time Saved");

  const criticalHosts = new Set(
    workbench.confirmed_findings
      .filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH")
      .map((f) => f.host)
      .filter(Boolean),
  );

  const signals = metrics?.findings_raw ?? Number(statValue(workbench, "Evidence Signals")) ?? 0;
  const dupNum = Number(duplicates) || 0;
  const reviewReduction =
    signals > 0 && dupNum > 0 ? `${Math.min(99, Math.round((dupNum / signals) * 100))}%` : "—";

  const investigations = metrics?.investigations ?? workbench.priority_queue?.length ?? "—";
  const requireAttention = metrics?.require_attention ?? "—";

  return [
    { label: "Files processed", value: files },
    { label: "Assets discovered", value: assets },
    { label: "Findings retained", value: uniqueVulns },
    { label: "Duplicate findings merged", value: duplicates },
    { label: "Investigations queued", value: investigations },
    { label: "Require attention", value: requireAttention },
    { label: "Critical assets", value: criticalHosts.size || "—" },
    { label: "High-risk attack paths", value: highRiskPaths },
    { label: "Cross-source matches", value: metrics?.cross_source_matches ?? workbench.totals.cross_source_matches ?? "—" },
    { label: "Estimated review reduction", value: reviewReduction },
    { label: "Estimated manual hours saved", value: hoursSaved },
  ];
}

function buildKeyObservations(
  workbench: WorkbenchData,
  prioritized: PrioritizedInvestigation[],
): string[] {
  const observations: string[] = [];
  const metrics = workbench.executive_metrics;
  const signals = metrics?.findings_raw ?? Number(statValue(workbench, "Evidence Signals")) ?? 0;
  const duplicates = metrics?.duplicates_removed ?? Number(statValue(workbench, "Duplicate Findings Removed")) ?? 0;

  if (signals > 0 && duplicates > 0) {
    observations.push(
      `${Math.round((duplicates / signals) * 100)}% of raw findings were duplicates merged by the correlator.`,
    );
  }

  const crossMatches = metrics?.cross_source_matches ?? workbench.totals.cross_source_matches ?? 0;
  if (crossMatches > 0) {
    observations.push(
      `${crossMatches} finding${crossMatches === 1 ? "" : "s"} independently corroborated across multiple scanners.`,
    );
  }

  const criticalHosts = workbench.confirmed_findings.filter(
    (f) => f.severity === "CRITICAL" || f.severity === "HIGH",
  );
  const hostCounts = new Map<string, number>();
  for (const f of criticalHosts) {
    if (f.host) hostCounts.set(f.host, (hostCounts.get(f.host) || 0) + 1);
  }
  const topHosts = [...hostCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (topHosts.length >= 2) {
    observations.push(
      `Two hosts (${topHosts[0][0].split(".")[0]}, ${topHosts[1][0].split(".")[0]}) account for most high-severity retained findings.`,
    );
  } else if (topHosts.length === 1) {
    observations.push(`${topHosts[0][0].split(".")[0]} concentrates the highest-priority retained findings.`);
  }

  const smbCount = workbench.confirmed_findings.filter((f) =>
    /smb|samba|cifs|445/i.test(`${f.title} ${f.host}`),
  ).length;
  if (smbCount >= 2 && prioritized.some((p) => /lateral|smb|movement/i.test(p.title))) {
    observations.push(`SMB-related exposure appears in a prioritized lateral movement investigation.`);
  }

  if (workbench.totals.rejected_paths > 0) {
    observations.push(
      `${workbench.totals.rejected_paths} candidate attack path${workbench.totals.rejected_paths === 1 ? " was" : "s were"} ruled out for insufficient evidence.`,
    );
  }

  const needsValidation = prioritized.filter((p) => p.claimStatus === "needs_validation" || p.claimStatus === "unknown").length;
  if (needsValidation > 0) {
    observations.push(
      `${needsValidation} queued investigation${needsValidation === 1 ? "" : "s"} require validation before asserting compromise.`,
    );
  }

  if (prioritized.filter((p) => p.tier === "Critical").length === 0 && prioritized.length > 0) {
    observations.push("Nothing in this upload currently qualifies as proof-grade critical exploitation.");
  }

  return observations.slice(0, 6);
}

function buildRecommendedActions(
  workbench: WorkbenchData,
  prioritized: PrioritizedInvestigation[],
): string[] {
  const actions: string[] = [];

  const top = prioritized[0];
  if (top) {
    const task = top.analystTasks[0];
    if (task) {
      actions.push(task.why ? `${task.action} — ${task.why}` : task.action);
    } else {
      const next =
        top.missingEvidence[0] ||
        (top.claimStatus === "needs_validation" ? `Validate: ${top.title}` : `Review: ${top.title}`);
      actions.push(next.endsWith(".") ? next : `${next}.`);
    }
  }

  for (const task of recommendationTasks(workbench).slice(0, 4)) {
    actions.push(task.action);
  }

  for (const action of workbench.next_actions.slice(0, 3)) {
    const cleaned = action.replace(/^\s*\d+[.)]\s+/, "").trim();
    if (cleaned && !actions.some((a) => a.toLowerCase() === cleaned.toLowerCase())) {
      actions.push(cleaned);
    }
  }

  return [...new Set(actions)].slice(0, 6);
}

export function buildExecutiveInvestigationOverview(
  workbench: WorkbenchData,
  bundle: InvestigationBundle,
  presentation: InvestigationPresentation,
): ExecutiveInvestigationOverview {
  void bundle;
  const prioritizedInvestigations = buildPrioritizedInvestigations(workbench);
  const audit = workbench.investigation_audit;

  return {
    executiveSummary: buildExecutiveSummarySentences(workbench, prioritizedInvestigations),
    prioritizedInvestigations,
    statistics: buildStatistics(workbench, presentation),
    keyObservations: buildKeyObservations(workbench, prioritizedInvestigations),
    recommendedActions: buildRecommendedActions(workbench, prioritizedInvestigations),
    auditComplete: audit?.complete,
    unsupportedClaimsBlocked: audit?.unsupported_claims_blocked,
  };
}

export const INVESTIGATION_DETAIL_SECTIONS = [
  "attack-graph",
  "findings",
  "business-impact",
  "confidence",
  "evidence",
  "recommendations",
  "timeline",
  "reasoning",
  "missing-evidence",
  "evidence-timeline",
  "evidence-files",
  "investigation-notes",
  "executive-detail",
  "at-a-glance",
] as const;

export type InvestigationDetailSectionId = (typeof INVESTIGATION_DETAIL_SECTIONS)[number];
