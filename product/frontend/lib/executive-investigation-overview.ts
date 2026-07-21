import type { InvestigationBundle } from "./investigation-bundle";
import type { InvestigationPresentation } from "./investigation-presentation";
import type { WorkbenchCandidatePath, WorkbenchConfirmedFinding, WorkbenchData } from "./types";
import { recommendationTasks } from "./workbench-report-helpers";

export type PriorityTier = "Critical" | "High" | "Medium" | "Low";

export interface PrioritizedInvestigation {
  id: string;
  tier: PriorityTier;
  title: string;
  riskScore: number;
  estimatedReviewMinutes: number;
  reason: string;
  /** Collapsible detail section to expand when the analyst opens this item. */
  detailSectionId: string;
}

export interface ExecutiveInvestigationOverview {
  executiveSummary: string[];
  prioritizedInvestigations: PrioritizedInvestigation[];
  statistics: Array<{ label: string; value: string | number }>;
  keyObservations: string[];
  recommendedActions: string[];
}

function statValue(workbench: WorkbenchData, label: string): string | number {
  const row = workbench.statistics.find((s) => s.label === label);
  return row?.value ?? "—";
}

function riskDisplayScore(path: WorkbenchCandidatePath): number {
  const fromRisk = Math.round((path.risk || 0) * 10);
  const fromConfidence = path.confidence || 0;
  return Math.min(99, Math.max(fromRisk, fromConfidence));
}

function tierFromScore(score: number, severity?: string): PriorityTier {
  const sev = (severity || "").toUpperCase();
  if (score >= 85 || sev === "CRITICAL") return "Critical";
  if (score >= 70 || sev === "HIGH") return "High";
  if (score >= 45 || sev === "MEDIUM") return "Medium";
  return "Low";
}

function reviewMinutes(tier: PriorityTier, steps: number): number {
  const base = tier === "Critical" ? 5 : tier === "High" ? 8 : tier === "Medium" ? 12 : 15;
  return Math.min(30, base + Math.max(0, steps - 3));
}

function pathTitle(path: WorkbenchCandidatePath): string {
  if (path.steps.length >= 2) {
    return `${path.steps[0]} → ${path.steps[path.steps.length - 1]} attack path`;
  }
  if (path.steps.length === 1) return `${path.steps[0]} exposure path`;
  return "Validated attack path";
}

function findingTitle(finding: WorkbenchConfirmedFinding): string {
  const host = finding.host ? ` on ${finding.host.split(".")[0]}` : "";
  return `${finding.title}${host}`;
}

function buildPrioritizedInvestigations(workbench: WorkbenchData): PrioritizedInvestigation[] {
  const items: PrioritizedInvestigation[] = [];

  const validatedPaths = workbench.candidate_paths.filter((p) => p.status === "VALIDATED");
  for (const [i, path] of validatedPaths.entries()) {
    const riskScore = riskDisplayScore(path);
    const tier = tierFromScore(riskScore);
    items.push({
      id: `path-${i}`,
      tier,
      title: pathTitle(path),
      riskScore,
      estimatedReviewMinutes: reviewMinutes(tier, path.steps.length),
      reason: path.reason || "Validated chain with supporting evidence across the environment.",
      detailSectionId: "attack-graph",
    });
  }

  for (const [i, finding] of workbench.confirmed_findings.entries()) {
    const score = finding.machine_confidence || 0;
    const riskScore =
      finding.severity === "CRITICAL"
        ? Math.max(score, 88)
        : finding.severity === "HIGH"
          ? Math.max(score, 72)
          : score;
    const tier = tierFromScore(riskScore, finding.severity);
    if (items.some((row) => row.title.toLowerCase().includes(finding.title.toLowerCase().slice(0, 12)))) {
      continue;
    }
    items.push({
      id: finding.id || `finding-${i}`,
      tier,
      title: findingTitle(finding),
      riskScore,
      estimatedReviewMinutes: reviewMinutes(tier, 2),
      reason:
        finding.why_it_matters ||
        finding.investigation?.conclusion ||
        "Retained finding with analyst-review-worthy exposure or impact.",
      detailSectionId: "findings",
    });
  }

  for (const [i, hyp] of workbench.hypotheses.slice(0, 3).entries()) {
    const score = hyp.confidence || 50;
    const tier = tierFromScore(score);
    items.push({
      id: `hyp-${i}`,
      tier,
      title: hyp.title,
      riskScore: score,
      estimatedReviewMinutes: reviewMinutes(tier, 3),
      reason: hyp.reason || hyp.required_validation || "Hypothesis requires validation before closing.",
      detailSectionId: "reasoning",
    });
  }

  const tierOrder: Record<PriorityTier, number> = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Low: 3,
  };

  return items
    .sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || b.riskScore - a.riskScore)
    .slice(0, 8);
}

function buildExecutiveSummarySentences(
  workbench: WorkbenchData,
  prioritized: PrioritizedInvestigation[],
): string[] {
  const files = workbench.totals.files || Number(statValue(workbench, "Files Parsed")) || 0;
  const signals = Number(statValue(workbench, "Evidence Signals")) || 0;
  const duplicates = Number(statValue(workbench, "Duplicate Findings Removed")) || 0;
  const retained = workbench.totals.confirmed_findings ?? workbench.confirmed_findings.length;
  const immediate = prioritized.filter((p) => p.tier === "Critical" || p.tier === "High").length;
  const reviewCount = prioritized.length || retained;

  const sentences: string[] = [];

  if (files > 0 && signals > 0) {
    sentences.push(
      `${files} scan file${files === 1 ? "" : "s"} containing approximately ${signals.toLocaleString()} findings were analyzed.`,
    );
  } else if (files > 0) {
    sentences.push(`${files} evidence file${files === 1 ? "" : "s"} were analyzed.`);
  } else {
    sentences.push("Uploaded evidence was analyzed across the in-scope environment.");
  }

  if (duplicates > 0) {
    sentences.push(
      "Most findings were repetitive and automatically merged.",
    );
    sentences.push(
      `${duplicates.toLocaleString()} duplicate finding${duplicates === 1 ? "" : "s"} were removed before review.`,
    );
  }

  sentences.push(
    `VANE identified ${reviewCount} investigation${reviewCount === 1 ? "" : "s"} requiring analyst review.`,
  );

  if (immediate > 0) {
    sentences.push(
      `Only ${immediate} investigation${immediate === 1 ? " represents immediate business risk" : "s represent immediate business risk"}.`,
    );
  } else {
    sentences.push("No investigation currently meets immediate business-risk thresholds.");
  }

  const lowPriority = Math.max(0, retained - immediate);
  if (lowPriority > 0) {
    sentences.push(
      "The remaining findings are informational or can wait until critical investigations are complete.",
    );
  }

  if (workbench.executive_summary && sentences.length < 4) {
    sentences.push(workbench.executive_summary.split(/(?<=[.!?])\s+/)[0]?.trim() || workbench.executive_summary);
  }

  return sentences.filter(Boolean).slice(0, 6);
}

function buildStatistics(workbench: WorkbenchData, presentation: InvestigationPresentation) {
  const files = workbench.totals.files || statValue(workbench, "Files Parsed");
  const assets = statValue(workbench, "Assets");
  const uniqueVulns = statValue(workbench, "Validated Findings");
  const duplicates = statValue(workbench, "Duplicate Findings Removed");
  const highRiskPaths = workbench.totals.validated_paths ?? presentation.executive.attackPaths;
  const hoursSaved = statValue(workbench, "Analyst Time Saved");

  const criticalHosts = new Set(
    workbench.confirmed_findings
      .filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH")
      .map((f) => f.host)
      .filter(Boolean),
  );

  const signals = Number(statValue(workbench, "Evidence Signals")) || 0;
  const dupNum = Number(duplicates) || 0;
  const reviewReduction =
    signals > 0 && dupNum > 0 ? `${Math.min(99, Math.round((dupNum / signals) * 100))}%` : "—";

  return [
    { label: "Files processed", value: files },
    { label: "Assets discovered", value: assets },
    { label: "Unique vulnerabilities", value: uniqueVulns },
    { label: "Duplicate findings merged", value: duplicates },
    { label: "Critical assets", value: criticalHosts.size || "—" },
    { label: "Internet-facing assets", value: presentation.executive.assets || assets },
    { label: "High-risk attack paths", value: highRiskPaths },
    { label: "Estimated analyst review reduction", value: reviewReduction },
    { label: "Estimated manual hours saved", value: hoursSaved },
  ];
}

function buildKeyObservations(
  workbench: WorkbenchData,
  prioritized: PrioritizedInvestigation[],
): string[] {
  const observations: string[] = [];
  const signals = Number(statValue(workbench, "Evidence Signals")) || 0;
  const duplicates = Number(statValue(workbench, "Duplicate Findings Removed")) || 0;

  if (signals > 0 && duplicates > 0) {
    observations.push(
      `${Math.round((duplicates / signals) * 100)}% of raw findings were duplicates.`,
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
      `Two hosts (${topHosts[0][0].split(".")[0]}, ${topHosts[1][0].split(".")[0]}) account for most critical risk.`,
    );
  } else if (topHosts.length === 1) {
    observations.push(`${topHosts[0][0].split(".")[0]} concentrates the highest-priority exposure.`);
  }

  const smbCount = workbench.confirmed_findings.filter((f) =>
    /smb|samba|cifs|445/i.test(`${f.title} ${f.host}`),
  ).length;
  if (smbCount >= 2) {
    observations.push(`SMB-related exposure appears across ${smbCount} retained finding${smbCount === 1 ? "" : "s"}.`);
  }

  if (workbench.totals.cross_source_matches > 1) {
    observations.push(
      `Credential or service reuse signals detected across ${workbench.totals.cross_source_matches} correlated matches.`,
    );
  }

  const low = workbench.confirmed_findings.filter((f) => f.severity === "LOW" || f.severity === "INFO").length;
  if (low > workbench.confirmed_findings.length / 2 && workbench.confirmed_findings.length > 2) {
    observations.push("Most remaining findings are low-severity configuration or informational issues.");
  }

  if (workbench.totals.rejected_paths > 0) {
    observations.push(
      `${workbench.totals.rejected_paths} candidate attack path${workbench.totals.rejected_paths === 1 ? " was" : "s were"} ruled out for insufficient evidence.`,
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
    actions.push(`Review "${top.title}" immediately.`);
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

  if (prioritized.some((p) => p.tier === "Low" || p.tier === "Medium")) {
    actions.push(
      "Defer informational SSL/TLS and configuration findings until critical investigations are complete.",
    );
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

  return {
    executiveSummary: buildExecutiveSummarySentences(workbench, prioritizedInvestigations),
    prioritizedInvestigations,
    statistics: buildStatistics(workbench, presentation),
    keyObservations: buildKeyObservations(workbench, prioritizedInvestigations),
    recommendedActions: buildRecommendedActions(workbench, prioritizedInvestigations),
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
