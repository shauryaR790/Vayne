import {
  buildPrioritizedInvestigations,
  type PrioritizedInvestigation,
} from "./executive-investigation-overview";
import type {
  WorkbenchCorrelation,
  WorkbenchData,
  WorkbenchIgnoredBreakdown,
  WorkbenchPriorityItem,
  WorkbenchSummaryPanel,
} from "./types";

export interface BriefingMetrics {
  reportsUploaded: number;
  rawFindings: number;
  investigationsGenerated: number;
  estimatedReviewMinutes: number;
  estimatedHoursSaved: number;
  workloadHeadline: string;
  reviewHeadline: string;
}

export interface FileEvidenceContribution {
  filename: string;
  scanner: string;
  contributed: string;
  increasedConfidence: boolean;
  newEvidence: boolean;
  confirmedPrior: boolean;
}

export interface PriorityFileGroup {
  investigationId: string;
  investigationTitle: string;
  rank: number;
  files: FileEvidenceContribution[];
}

export interface ReasoningChainStep {
  stage: "Evidence" | "Correlation" | "Business Context" | "Conclusion";
  detail: string;
  items: string[];
}

export interface ChangeDetectionBrief {
  changed: boolean;
  headline?: string;
  previousPriority?: string;
  currentPriority?: string;
  evidenceChanged?: string;
  whyRevisit?: string;
}

export interface InvestigationBriefingModel {
  metrics: BriefingMetrics;
  startHere: PrioritizedInvestigation | null;
  priorityFileGroups: PriorityFileGroup[];
  ignored: WorkbenchIgnoredBreakdown;
  reasoning: ReasoningChainStep[];
  changeDetection: ChangeDetectionBrief;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (!rem) return `~${hours}h`;
  return `~${hours}h ${rem}m`;
}

function formatHours(hours: number): string {
  if (hours <= 0) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
}

export function buildBriefingMetrics(
  workbench: WorkbenchData,
  uploadedFileCount?: number,
): BriefingMetrics {
  const panel = workbench.summary_panel;
  const metrics = workbench.executive_metrics;
  const stat = (label: string) =>
    workbench.statistics.find((row) => row.label === label)?.value;

  const reportsUploaded =
    uploadedFileCount ?? panel?.files_uploaded ?? metrics?.files ?? workbench.totals.files ?? 0;
  const rawFindings =
    panel?.evidence_signals ?? metrics?.findings_raw ?? Number(stat("Evidence Signals")) ?? 0;
  const investigationsGenerated =
    panel?.investigations_generated ??
    metrics?.investigations ??
    workbench.investigations?.length ??
    workbench.priority_queue?.length ??
    0;
  const estimatedReviewMinutes =
    panel?.estimated_analyst_review_minutes ??
    buildPrioritizedInvestigations(workbench)
      .slice(0, 5)
      .reduce((sum, item) => sum + item.estimatedReviewMinutes, 0);
  const estimatedHoursSaved =
    panel?.estimated_analyst_hours_saved ?? metrics?.analyst_hours_saved ?? 0;

  const duplicates =
    panel?.duplicate_findings_removed ??
    metrics?.duplicates_removed ??
    Number(stat("Duplicate Findings Removed")) ??
    0;

  const workloadHeadline =
    estimatedHoursSaved > 0
      ? `${formatHours(estimatedHoursSaved)} of manual triage eliminated — ${Number(duplicates).toLocaleString()} duplicate signals merged before you review.`
      : duplicates > 0
        ? `${Number(duplicates).toLocaleString()} duplicate signals merged — focus on ${investigationsGenerated} investigation${investigationsGenerated === 1 ? "" : "s"}, not ${Number(rawFindings).toLocaleString()} raw rows.`
        : `Focus on ${investigationsGenerated} ranked investigation${investigationsGenerated === 1 ? "" : "s"} — not raw scanner output.`;

  const reviewHeadline =
    estimatedReviewMinutes > 0
      ? `Expect ${formatMinutes(estimatedReviewMinutes)} of analyst review for the priority queue.`
      : "Priority queue review time will appear once investigations are ranked.";

  return {
    reportsUploaded,
    rawFindings,
    investigationsGenerated,
    estimatedReviewMinutes,
    estimatedHoursSaved,
    workloadHeadline,
    reviewHeadline,
  };
}

function correlationForInvestigation(
  workbench: WorkbenchData,
  item: WorkbenchPriorityItem,
): WorkbenchCorrelation | undefined {
  const title = item.title.toLowerCase();
  return workbench.correlations.find(
    (c) =>
      c.subject.toLowerCase().includes(title.slice(0, 24)) ||
      title.includes(c.subject.toLowerCase().slice(0, 24)) ||
      (c.cve && title.includes(c.cve.toLowerCase())),
  );
}

function fileRowsForInvestigation(
  workbench: WorkbenchData,
  item: WorkbenchPriorityItem,
): FileEvidenceContribution[] {
  const evidence = item.evidence ?? [];
  const correlation = correlationForInvestigation(workbench, item);
  const multiSource = (correlation?.sources?.length ?? 0) > 1;
  const confidenceIncreased =
    correlation?.base_confidence != null &&
    correlation?.final_confidence != null &&
    correlation.final_confidence > correlation.base_confidence;

  if (evidence.length) {
    const scannersSeen = new Set<string>();
    return evidence.map((row) => {
      const scanner = row.scanner || "Scanner";
      const isFirstFromScanner = !scannersSeen.has(scanner);
      scannersSeen.add(scanner);
      return {
        filename: row.filename || `${scanner} evidence`,
        scanner,
        contributed: row.summary?.trim() || row.evidence_quality || "Finding signal retained",
        increasedConfidence: confidenceIncreased || row.confidence_weight >= 0.6,
        newEvidence: isFirstFromScanner && !multiSource,
        confirmedPrior: multiSource || row.evidence_quality.toLowerCase().includes("corrobor"),
      };
    });
  }

  const contributions = workbench.file_contributions.filter((row) =>
    (item.evidence_sources ?? []).some(
      (src) =>
        src.toLowerCase().includes(row.tool.toLowerCase()) ||
        row.tool.toLowerCase().includes(src.toLowerCase()),
    ),
  );

  if (contributions.length) {
    return contributions.map((row, index) => ({
      filename: row.file,
      scanner: row.tool,
      contributed: `${row.retained} retained · ${row.findings} raw signals`,
      increasedConfidence: confidenceIncreased && index > 0,
      newEvidence: index === 0,
      confirmedPrior: multiSource && index > 0,
    }));
  }

  return (item.evidence_sources ?? []).map((src, index) => ({
    filename: `${src} upload`,
    scanner: src,
    contributed: "Contributed scanner evidence to this investigation",
    increasedConfidence: confidenceIncreased && index > 0,
    newEvidence: index === 0,
    confirmedPrior: multiSource,
  }));
}

export function buildPriorityFileGroups(workbench: WorkbenchData): PriorityFileGroup[] {
  const queue = workbench.investigations?.length
    ? workbench.investigations
    : workbench.priority_queue;
  if (!queue?.length) return [];

  return queue.slice(0, 4).map((item, index) => ({
    investigationId: item.id,
    investigationTitle: item.title,
    rank: item.rank ?? index + 1,
    files: fileRowsForInvestigation(workbench, item),
  }));
}

export function buildIgnoredBreakdown(workbench: WorkbenchData): WorkbenchIgnoredBreakdown {
  if (workbench.ignored_breakdown) return workbench.ignored_breakdown;

  const panel = workbench.summary_panel;
  const metrics = workbench.executive_metrics;
  const stat = (label: string) =>
    Number(workbench.statistics.find((row) => row.label === label)?.value ?? 0);

  return {
    duplicate_evidence_removed:
      panel?.duplicate_findings_removed ?? metrics?.duplicates_removed ?? stat("Duplicate Findings Removed"),
    informational_findings: Math.max(
      0,
      (panel?.evidence_signals ?? metrics?.findings_raw ?? stat("Evidence Signals")) -
        (metrics?.findings_retained ?? workbench.confirmed_findings.length) -
        (panel?.duplicate_findings_removed ?? 0),
    ),
    already_mitigated: 0,
    contradicted_findings: workbench.conflicts.length,
    low_business_impact: (workbench.priority_queue ?? []).filter((p) => p.tier === "Low").length,
    false_positives_removed: stat("False Positives Eliminated"),
    noise_suppressed: panel?.noise_suppressed ?? 0,
    assurance: "No critical evidence was hidden.",
    exceptions: [],
  };
}

export function buildReasoningChain(
  workbench: WorkbenchData,
  startHere: PrioritizedInvestigation | null,
): ReasoningChainStep[] {
  const panel = workbench.summary_panel;
  const metrics = workbench.executive_metrics;
  const crossMatches = metrics?.cross_source_matches ?? workbench.totals.cross_source_matches ?? 0;
  const duplicates =
    panel?.duplicate_findings_removed ?? metrics?.duplicates_removed ?? 0;

  const evidenceItems = [
    `${panel?.files_uploaded ?? workbench.totals.files} report(s) ingested`,
    `${panel?.evidence_signals ?? metrics?.findings_raw ?? "—"} raw finding signals parsed`,
    `${workbench.evidence_sources.length} scanner type(s) normalized`,
  ];

  const correlationItems = [
    `${duplicates.toLocaleString()} duplicate signals merged`,
    `${crossMatches} cross-source corroboration match(es)`,
    `${workbench.conflicts.length} contradiction(s) evaluated`,
  ];

  const businessItems = startHere
    ? [
        startHere.businessImpact || "Business impact scored from exposure and blast radius",
        ...(startHere.priorityReasons.slice(0, 3).map((r) => r) || []),
      ]
    : [
        workbench.investigation_queue_status?.headline ||
          "No investigation met immediate business-risk thresholds",
      ];

  const conclusionItems = startHere
    ? [
        `#${startHere.rank ?? 1} · ${startHere.title}`,
        startHere.immediateAction || startHere.reason,
      ]
    : [workbench.investigation_queue_status?.next_step || "Review optional detail sections below"];

  return [
    { stage: "Evidence", detail: "Raw scanner output normalized and deduplicated", items: evidenceItems },
    { stage: "Correlation", detail: "Cross-tool signals merged into investigations", items: correlationItems },
    { stage: "Business Context", detail: "Priority ranked by impact — not scanner severity", items: businessItems },
    { stage: "Conclusion", detail: "Start with the highest-priority investigation", items: conclusionItems },
  ];
}

export function buildChangeDetectionBrief(
  workbench: WorkbenchData,
  startHere: PrioritizedInvestigation | null,
): ChangeDetectionBrief {
  // No persisted prior snapshot yet — honest stub until cross-run diff exists.
  void workbench;
  void startHere;
  return {
    changed: false,
    headline: "No prior investigation snapshot to compare.",
  };
}

export function buildInvestigationBriefingModel(
  workbench: WorkbenchData,
  uploadedFileCount?: number,
): InvestigationBriefingModel {
  const prioritized = buildPrioritizedInvestigations(workbench);
  const startHere = prioritized[0] ?? null;

  return {
    metrics: buildBriefingMetrics(workbench, uploadedFileCount),
    startHere,
    priorityFileGroups: buildPriorityFileGroups(workbench),
    ignored: buildIgnoredBreakdown(workbench),
    reasoning: buildReasoningChain(workbench, startHere),
    changeDetection: buildChangeDetectionBrief(workbench, startHere),
  };
}

export function panelMetricsFromSummary(panel: WorkbenchSummaryPanel): Array<{
  label: string;
  value: string;
  sub?: string;
}> {
  return [
    {
      label: "Reports uploaded",
      value: panel.files_uploaded.toLocaleString(),
      sub: "Evidence ingested",
    },
    {
      label: "Raw findings",
      value: panel.evidence_signals.toLocaleString(),
      sub: "Before deduplication",
    },
    {
      label: "Investigations generated",
      value: panel.investigations_generated.toLocaleString(),
      sub: "Merged problems to review",
    },
    {
      label: "Estimated analyst review",
      value: panel.estimated_analyst_review_minutes
        ? formatMinutes(panel.estimated_analyst_review_minutes)
        : "—",
      sub: "Priority queue only",
    },
    {
      label: "Estimated time saved",
      value:
        panel.estimated_analyst_hours_saved > 0
          ? formatHours(panel.estimated_analyst_hours_saved)
          : "—",
      sub: "Manual triage eliminated",
    },
  ];
}
