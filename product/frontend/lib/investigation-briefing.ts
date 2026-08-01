import {
  buildPrioritizedInvestigations,
  type PrioritizedInvestigation,
} from "./executive-investigation-overview";
import { isInternalScoringText, sanitizeAnalystText } from "./analyst-display";
import type {
  WorkbenchConfirmedFinding,
  WorkbenchData,
  WorkbenchPriorityItem,
  WorkbenchSummaryPanel,
} from "./types";

export interface InvestigationSummaryCard {
  title: string;
  host: string;
  status: string;
  confidence: number | null;
  businessRisk: string;
  estimatedReview: string;
  recommendedAction: string;
}

export interface EvidenceTimelineStep {
  actor: string;
  detail: string;
  note?: string;
}

export interface ReasoningChainStep {
  stage: "Evidence" | "Correlation" | "Business Context" | "Conclusion";
  detail: string;
  items: string[];
}

export interface InvestigationConsoleModel {
  summary: InvestigationSummaryCard | null;
  whyExists: string[];
  evidenceTimeline: EvidenceTimelineStep[];
  reasoningGraph: ReasoningChainStep[];
  reasoningTitle: string;
  reasoningBullets: string[];
  decisionChangers: string[];
  checklist: string[];
  emptyHeadline?: string;
  emptyDetail?: string;
}

const TELEMETRY =
  /\b(normalized|parsed|deduplicat|signal|telemetry|fingerprint|composite score|version parsed|ranked\s*#?\s*\d+)\b/i;

function cleanLine(text: string, fallback = ""): string {
  const cleaned = sanitizeAnalystText(text, "").replace(/\s+/g, " ").trim();
  if (!cleaned || TELEMETRY.test(cleaned) || isInternalScoringText(cleaned)) return fallback;
  return cleaned;
}

function formatReviewMinutes(minutes: number): string {
  if (!minutes || minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (!rem) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours}h ${rem}m`;
}

function statusLabel(claimStatus: string): string {
  const raw = (claimStatus || "").toLowerCase();
  if (raw.includes("confirm")) return "Confirmed";
  if (raw.includes("suspect")) return "Suspected";
  if (raw.includes("false")) return "Likely False Positive";
  return "Needs Validation";
}

function rawQueueItem(
  workbench: WorkbenchData,
  id: string,
): WorkbenchPriorityItem | undefined {
  const queue = workbench.investigations?.length
    ? workbench.investigations
    : workbench.priority_queue;
  return queue?.find((item) => item.id === id) ?? queue?.[0];
}

function relatedFinding(
  workbench: WorkbenchData,
  item: PrioritizedInvestigation,
): WorkbenchConfirmedFinding | undefined {
  const host = item.affectedAssets[0]?.toLowerCase();
  const title = item.title.toLowerCase();
  const findings = workbench.confirmed_findings;
  if (!findings.length) return undefined;

  const byHostAndTitle = findings.find((f) => {
    const fTitle = f.title.toLowerCase();
    const hostMatch = host ? f.host?.toLowerCase() === host : true;
    return (
      hostMatch &&
      (fTitle.includes(title.slice(0, 18)) || title.includes(fTitle.slice(0, 18)))
    );
  });
  if (byHostAndTitle) return byHostAndTitle;

  if (host) {
    const byHost = findings.find((f) => f.host?.toLowerCase() === host);
    if (byHost) return byHost;
  }
  return findings[0];
}

function sourceCount(item: PrioritizedInvestigation, raw?: WorkbenchPriorityItem): number {
  const fromEvidence = raw?.evidence?.length
    ? new Set(raw.evidence.map((row) => row.scanner || "Scanner")).size
    : 0;
  return Math.max(item.evidenceSources.length, fromEvidence, item.evidenceCount > 0 ? 1 : 0);
}

function hasExploitPath(workbench: WorkbenchData, item: PrioritizedInvestigation): boolean {
  if ((workbench.totals?.validated_paths ?? 0) > 0) return true;
  const host = item.affectedAssets[0]?.toLowerCase();
  const paths = workbench.candidate_paths ?? [];
  const validated = paths.filter((p) => p.status === "VALIDATED");
  if (!validated.length) return false;
  if (!host) return true;
  return validated.some((p) =>
    (p.steps ?? []).some((step) => String(step).toLowerCase().includes(host)),
  );
}

function twoWordTitle(title: string, tier: string): string {
  const stop = new Set([
    "a",
    "an",
    "and",
    "for",
    "from",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
  ]);
  const words = title
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !stop.has(w.toLowerCase()));

  if (words.length >= 2) return `${words[0]} ${words[1]}`.toUpperCase();
  if (words.length === 1) return `${words[0]} RISK`.toUpperCase();
  return `${tier} RISK`.toUpperCase();
}

function buildSummary(
  item: PrioritizedInvestigation,
  finding: WorkbenchConfirmedFinding | undefined,
): InvestigationSummaryCard {
  const host =
    item.affectedAssets[0] ||
    finding?.host ||
    item.affectedIdentities[0] ||
    "Unknown host";

  return {
    title: twoWordTitle(item.title, item.tier),
    host,
    status: statusLabel(item.claimStatus),
    confidence: Number.isFinite(item.confidence) ? Math.round(item.confidence) : null,
    businessRisk: item.tier,
    estimatedReview: formatReviewMinutes(item.estimatedReviewMinutes),
    recommendedAction:
      cleanLine(item.immediateAction) ||
      cleanLine(item.analystTasks[0]?.action || "") ||
      "Validate manually before remediation.",
  };
}

function buildWhyExists(
  item: PrioritizedInvestigation,
  finding: WorkbenchConfirmedFinding | undefined,
  workbench: WorkbenchData,
  raw?: WorkbenchPriorityItem,
): string[] {
  const paragraphs: string[] = [];
  const sources = sourceCount(item, raw);
  const exploit = hasExploitPath(workbench, item);
  const serviceHint =
    cleanLine(finding?.title || "") ||
    cleanLine(item.title) ||
    "a security weakness";

  const host = item.affectedAssets[0] || finding?.host;
  const discovery = host
    ? `The engine observed ${serviceHint} on ${host} during asset discovery.`
    : `The engine observed ${serviceHint} during asset discovery.`;
  paragraphs.push(discovery);

  if (exploit) {
    paragraphs.push(
      "Supporting attack-path evidence raises the chance this can be chained into a broader compromise.",
    );
  } else {
    paragraphs.push("No exploit evidence was found for this observation.");
  }

  if (sources <= 1) {
    paragraphs.push("Only one scanner observed this issue.");
  } else {
    paragraphs.push(
      `${sources} independent scanners contributed evidence for this investigation.`,
    );
  }

  const why =
    cleanLine(item.reason) ||
    cleanLine(finding?.why_it_matters || "") ||
    cleanLine(finding?.unique_reason || "");
  if (why && !paragraphs.some((p) => p.toLowerCase().includes(why.toLowerCase().slice(0, 24)))) {
    paragraphs.push(why);
  }

  paragraphs.push("Additional validation is required before asserting risk.");
  return paragraphs;
}

function buildEvidenceTimeline(
  item: PrioritizedInvestigation,
  finding: WorkbenchConfirmedFinding | undefined,
  workbench: WorkbenchData,
  raw?: WorkbenchPriorityItem,
): EvidenceTimelineStep[] {
  const steps: EvidenceTimelineStep[] = [];
  const evidenceRows = raw?.evidence ?? [];

  if (evidenceRows.length) {
    for (const row of evidenceRows.slice(0, 4)) {
      const actor = row.scanner || "Scanner";
      const detail =
        cleanLine(row.summary || "") ||
        cleanLine(finding?.title || item.title) ||
        "Observed finding retained for review";
      const weight = row.confidence_weight;
      const note =
        weight >= 0.75
          ? "Strong evidence"
          : weight >= 0.45
            ? "Partial evidence"
            : "Limited evidence";
      steps.push({ actor, detail, note });
    }
  } else if (item.evidenceSources.length) {
    for (const src of item.evidenceSources.slice(0, 3)) {
      steps.push({
        actor: src,
        detail:
          cleanLine(finding?.title || item.title) ||
          "Observed service or weakness during scan",
        note: "Observation retained",
      });
    }
  } else if (finding) {
    for (const src of (finding.sources.length ? finding.sources : ["Scanner"]).slice(0, 2)) {
      steps.push({
        actor: src,
        detail: cleanLine(finding.title) || item.title,
        note:
          finding.machine_confidence >= 75
            ? "Strong evidence"
            : finding.machine_confidence >= 50
              ? "Partial evidence"
              : "Limited evidence",
      });
    }
  } else {
    steps.push({
      actor: "Evidence Intake",
      detail: cleanLine(item.title) || "Investigation opened from retained findings",
    });
  }

  const sources = sourceCount(item, raw);
  steps.push({
    actor: "Correlation Engine",
    detail:
      sources > 1
        ? "Multiple scanners contributed corroborating evidence for the same subject."
        : "No supporting findings from other scanners.",
  });

  const exploit = hasExploitPath(workbench, item);
  steps.push({
    actor: "Investigation Engine",
    detail: exploit
      ? "A candidate attack path met the evidence bar for further review."
      : "Unable to confirm exploitability from available evidence.",
  });

  steps.push({
    actor: "Conclusion",
    detail:
      item.tier === "Critical" || item.tier === "High"
        ? "Prioritize validation and containment planning."
        : "Requires analyst validation before remediation decisions.",
  });

  return steps;
}

function buildReasoning(
  item: PrioritizedInvestigation,
  workbench: WorkbenchData,
  raw?: WorkbenchPriorityItem,
): { title: string; bullets: string[] } {
  const tier = item.tier.toUpperCase();
  const title = `Why this is ${tier} priority`;
  const bullets: string[] = [];
  const sources = sourceCount(item, raw);
  const exploit = hasExploitPath(workbench, item);

  for (const reason of item.priorityReasons) {
    const line = cleanLine(reason);
    if (line && !bullets.includes(line)) bullets.push(line);
  }

  if (sources <= 1) {
    bullets.push("Only one independent source observed the issue");
  } else {
    bullets.push(`${sources} independent sources observed the issue`);
  }

  if (!exploit) {
    bullets.push("No exploit chain exists");
    bullets.push("No corroborating scanner evidence of active exploitation");
  } else {
    bullets.push("Attack-path evidence elevates urgency pending validation");
  }

  if (item.affectedAssets.length <= 1 && item.affectedIdentities.length === 0) {
    bullets.push("No sensitive asset relationships detected beyond the observed host");
  }

  if (item.missingEvidence.length) {
    bullets.push("Manual validation required — key evidence is still missing");
  } else if (statusLabel(item.claimStatus) === "Needs Validation") {
    bullets.push("Manual validation required");
  }

  // Prefer specific bullets; drop near-duplicates.
  const unique: string[] = [];
  for (const bullet of bullets) {
    const key = bullet.toLowerCase();
    if (unique.some((u) => u.toLowerCase().includes(key.slice(0, 28)) || key.includes(u.toLowerCase().slice(0, 28)))) {
      continue;
    }
    unique.push(bullet);
  }

  return { title, bullets: unique.slice(0, 6) };
}

function buildDecisionChangers(
  item: PrioritizedInvestigation,
  workbench: WorkbenchData,
): string[] {
  const lines: string[] = [];
  for (const missing of item.missingEvidence.slice(0, 4)) {
    const cleaned = cleanLine(missing);
    if (cleaned) lines.push(cleaned);
  }

  const defaults = [
    "Another scanner confirms a matching CVE or misconfiguration",
    "Exploit tooling or traffic proves the weakness is reachable",
    "A public exploit is available for the observed service version",
    "The asset is tagged Production or handles customer data",
  ];

  for (const line of defaults) {
    if (lines.length >= 4) break;
    if (!lines.some((existing) => existing.toLowerCase().includes(line.toLowerCase().slice(0, 18)))) {
      lines.push(line);
    }
  }

  void workbench;
  return lines.slice(0, 4);
}

function buildChecklist(item: PrioritizedInvestigation): string[] {
  const fromTasks = item.analystTasks
    .map((task) => cleanLine(task.action))
    .filter(Boolean);

  if (fromTasks.length) return fromTasks.slice(0, 5);

  const host = item.affectedAssets[0];
  return [
    host ? `Confirm the finding manually on ${host}` : "Confirm the finding manually",
    "Verify whether the asset is production-exposed",
    "Compare the observed service against supported releases",
    "Document residual risk if remediation is deferred",
    "Re-run the scan after remediation",
  ];
}

function buildReasoningGraph(
  item: PrioritizedInvestigation,
  finding: WorkbenchConfirmedFinding | undefined,
  workbench: WorkbenchData,
  raw?: WorkbenchPriorityItem,
): ReasoningChainStep[] {
  const sources = sourceCount(item, raw);
  const exploit = hasExploitPath(workbench, item);
  const host = item.affectedAssets[0] || finding?.host || "target";
  const files =
    workbench.summary_panel?.files_uploaded ??
    workbench.executive_metrics?.files ??
    workbench.totals.files ??
    workbench.evidence_sources.length;
  const scanners = Math.max(workbench.evidence_sources.length, sources, 1);
  const duplicates =
    workbench.summary_panel?.duplicate_findings_removed ??
    workbench.executive_metrics?.duplicates_removed ??
    0;
  const crossMatches =
    workbench.executive_metrics?.cross_source_matches ??
    workbench.totals.cross_source_matches ??
    0;

  return [
    {
      stage: "Evidence",
      detail: "Scanner observations retained for this subject",
      items: [
        `${files} report${files === 1 ? "" : "s"} reviewed`,
        cleanLine(finding?.title || item.title) || `Observation on ${host}`,
        `${scanners} scanner type${scanners === 1 ? "" : "s"} involved`,
      ].filter(Boolean),
    },
    {
      stage: "Correlation",
      detail: "Cross-tool agreement evaluated for this investigation",
      items: [
        sources > 1
          ? `${sources} sources agree on the same subject`
          : "No supporting findings from other scanners",
        `${Number(duplicates).toLocaleString()} duplicate observation${Number(duplicates) === 1 ? "" : "s"} merged`,
        `${crossMatches} cross-source corroboration match${crossMatches === 1 ? "" : "es"}`,
      ],
    },
    {
      stage: "Business Context",
      detail: "Priority ranked by impact — not scanner severity alone",
      items: [
        `Business risk: ${item.tier}`,
        statusLabel(item.claimStatus),
        exploit
          ? "Attack-path evidence raises urgency"
          : "No exploit evidence available",
        ...(item.priorityReasons[0] ? [cleanLine(item.priorityReasons[0])].filter(Boolean) : []),
      ].filter(Boolean) as string[],
    },
    {
      stage: "Conclusion",
      detail: "Start with this investigation before expanding optional detail",
      items: [
        twoWordTitle(item.title, item.tier),
        cleanLine(item.immediateAction) || "Validate finding manually",
      ],
    },
  ];
}

export function buildInvestigationConsoleModel(
  workbench: WorkbenchData,
): InvestigationConsoleModel {
  const prioritized = buildPrioritizedInvestigations(workbench);
  const startHere = prioritized[0] ?? null;

  if (!startHere) {
    return {
      summary: null,
      whyExists: [],
      evidenceTimeline: [],
      reasoningGraph: [],
      reasoningTitle: "Investigation Reasoning",
      reasoningBullets: [],
      decisionChangers: [],
      checklist: [],
      emptyHeadline:
        workbench.investigation_queue_status?.headline ||
        "No investigation currently requires immediate review.",
      emptyDetail:
        workbench.investigation_queue_status?.next_step ||
        "Optional engine detail sections below remain available if you need supporting artifacts.",
    };
  }

  const raw = rawQueueItem(workbench, startHere.id);
  const finding = relatedFinding(workbench, startHere);
  const reasoning = buildReasoning(startHere, workbench, raw);

  return {
    summary: buildSummary(startHere, finding),
    whyExists: buildWhyExists(startHere, finding, workbench, raw),
    evidenceTimeline: buildEvidenceTimeline(startHere, finding, workbench, raw),
    reasoningGraph: buildReasoningGraph(startHere, finding, workbench, raw),
    reasoningTitle: reasoning.title,
    reasoningBullets: reasoning.bullets,
    decisionChangers: buildDecisionChangers(startHere, workbench),
    checklist: buildChecklist(startHere),
  };
}

/** @deprecated Prefer buildInvestigationConsoleModel — kept for any legacy callers. */
export function buildInvestigationBriefingModel(workbench: WorkbenchData) {
  const consoleModel = buildInvestigationConsoleModel(workbench);
  const prioritized = buildPrioritizedInvestigations(workbench);
  return {
    metrics: {
      reportsUploaded: 0,
      rawFindings: 0,
      investigationsGenerated: prioritized.length,
      estimatedReviewMinutes: prioritized[0]?.estimatedReviewMinutes ?? 0,
      estimatedHoursSaved: 0,
      workloadHeadline: consoleModel.summary?.title || consoleModel.emptyHeadline || "",
      reviewHeadline: consoleModel.summary?.recommendedAction || consoleModel.emptyDetail || "",
    },
    startHere: prioritized[0] ?? null,
    priorityFileGroups: [],
    ignored: {
      duplicate_evidence_removed: 0,
      informational_findings: 0,
      already_mitigated: 0,
      contradicted_findings: 0,
      low_business_impact: 0,
      assurance: "",
      exceptions: [] as string[],
    },
    reasoning: [] as Array<{ stage: string; detail: string; items: string[] }>,
    changeDetection: { changed: false as const },
    console: consoleModel,
  };
}

export function panelMetricsFromSummary(panel: WorkbenchSummaryPanel): Array<{
  label: string;
  value: string;
  sub?: string;
}> {
  // Engine Session owns operating metrics — report UI should not render these.
  void panel;
  return [];
}
