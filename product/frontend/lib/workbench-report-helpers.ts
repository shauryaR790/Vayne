import type {
  WorkbenchCandidatePath,
  WorkbenchConfirmedFinding,
  WorkbenchConfidenceMetric,
  WorkbenchConfidenceMetricKey,
  WorkbenchData,
  WorkbenchSemanticConfidence,
  WorkbenchStat,
  WorkbenchUnknown,
} from "@/lib/types";

export const CARD_BORDER = "border border-white/30 bg-vx-panel";

export const CONFIDENCE_METRIC_LABEL: Record<WorkbenchConfidenceMetricKey, string> = {
  observation: "Observation",
  correlation: "Correlation",
  exploit: "Exploit",
};

export function semanticConfidence(
  finding: WorkbenchConfirmedFinding,
): WorkbenchSemanticConfidence | null {
  if (finding.confidence?.observation) {
    return {
      ...finding.confidence,
      evidence_summary: finding.confidence.evidence_summary || finding.evidence_summary,
      scanner_agreement: finding.confidence.scanner_agreement || finding.scanner_agreement,
    };
  }
  // Legacy fallback — treat machine_confidence as observation only.
  const score = finding.machine_confidence;
  return {
    kind: "service_observation",
    observation: {
      score,
      factors: finding.confidence_factors || [],
      question: "Does this asset, service, or vulnerability exist?",
    },
    correlation: null,
    exploit: null,
    display: ["observation"],
    primary: { metric: "observation", score },
    evidence_summary: finding.evidence_summary,
    scanner_agreement: finding.scanner_agreement,
  };
}

export function displayedConfidenceMetrics(
  finding: WorkbenchConfirmedFinding,
): Array<{ key: WorkbenchConfidenceMetricKey; label: string; metric: WorkbenchConfidenceMetric }> {
  const sem = semanticConfidence(finding);
  if (!sem) return [];
  const out: Array<{
    key: WorkbenchConfidenceMetricKey;
    label: string;
    metric: WorkbenchConfidenceMetric;
  }> = [];
  for (const key of sem.display) {
    const metric = sem[key];
    if (!metric) continue;
    out.push({ key, label: CONFIDENCE_METRIC_LABEL[key], metric });
  }
  return out;
}

export function validationFingerprint(finding: WorkbenchConfirmedFinding): string {
  return JSON.stringify({
    v: finding.validated_checks,
    n: finding.not_validated_checks,
  });
}

export function validationSummary(finding: WorkbenchConfirmedFinding): {
  passed: number;
  total: number;
} {
  const passed = finding.validated_checks.length;
  const total = passed + finding.not_validated_checks.length;
  return { passed, total };
}

export function dominantValidationProfile(findings: WorkbenchConfirmedFinding[]): {
  fingerprint: string;
  count: number;
  sample: WorkbenchConfirmedFinding;
} | null {
  if (!findings.length) return null;
  const counts = new Map<string, { count: number; sample: WorkbenchConfirmedFinding }>();
  for (const f of findings) {
    const key = validationFingerprint(f);
    const row = counts.get(key);
    if (row) row.count += 1;
    else counts.set(key, { count: 1, sample: f });
  }
  let best: { fingerprint: string; count: number; sample: WorkbenchConfirmedFinding } | null =
    null;
  for (const [fingerprint, row] of counts) {
    if (!best || row.count > best.count) {
      best = { fingerprint, ...row };
    }
  }
  return best && best.count > 1 ? best : null;
}

export function shortenUnknown(text: string): string {
  return text
    .replace(/^Unknown if /i, "")
    .replace(/^Unknown whether /i, "")
    .replace(/\.$/, "")
    .trim();
}

export function normalizeUnknown(item: string | WorkbenchUnknown): WorkbenchUnknown {
  if (typeof item !== "string") {
    return {
      topic: item.topic,
      reason: item.reason,
      evidence_needed: item.evidence_needed,
      expected_gain: item.expected_gain ?? 0,
    };
  }
  const topic = shortenUnknown(item);
  return {
    topic: topic || item,
    reason: "Not observed",
    evidence_needed: "Manual validation",
    expected_gain: 0,
  };
}

export function missingEvidenceRows(workbench: WorkbenchData): WorkbenchUnknown[] {
  const source = workbench.missing_evidence?.length
    ? workbench.missing_evidence
    : workbench.unknowns;
  return source
    .map(normalizeUnknown)
    .sort((a, b) => (b.expected_gain || 0) - (a.expected_gain || 0));
}

export function normalizeFailureReason(reason: string): string {
  const r = reason.toLowerCase().replace(/_/g, " ").trim();
  if (r.includes("credential")) return "No credentials";
  if (r.includes("exploit") || r.includes("verification") || r.includes("poc")) {
    return "No exploit verification";
  }
  if (r.includes("privilege") || r.includes("escalation")) return "No privilege escalation";
  if (r.includes("target") || r.includes("downstream") || r.includes("impact")) {
    return "No downstream target";
  }
  if (r.includes("confidence") || r.includes("threshold")) return "Below confidence threshold";
  if (r.includes("depth") || r.includes("prune")) return "Path depth exceeded";
  return reason.replace(/_/g, " ").slice(0, 48);
}

export function summarizePathFailures(paths: WorkbenchCandidatePath[]): Array<{
  reason: string;
  count: number;
}> {
  const rejected = paths.filter((p) => p.status === "REJECTED");
  const counts = new Map<string, number>();
  for (const path of rejected) {
    const reasons = new Set<string>();
    reasons.add(normalizeFailureReason(path.reason));
    for (const m of path.missing) {
      reasons.add(normalizeFailureReason(m));
    }
    for (const r of reasons) {
      counts.set(r, (counts.get(r) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

const CORE_STATS = [
  "Files Parsed",
  "Assets",
  "Services",
  "Evidence Signals",
  "Correlation Matches",
  "Validated Findings",
  "Rejected Paths",
  "Analyst Time Saved",
] as const;

export function coreStatistics(stats: WorkbenchStat[]): WorkbenchStat[] {
  const labelMap: Record<string, string> = {
    "Files Parsed": "Files",
    "Correlation Matches": "Correlations",
    "Validated Findings": "Validated Findings",
    "Rejected Paths": "Rejected Paths",
    "Analyst Time Saved": "Analyst Time Saved",
    "Evidence Signals": "Evidence Signals",
    Assets: "Assets",
    Services: "Services",
  };
  const picked: WorkbenchStat[] = [];
  for (const key of CORE_STATS) {
    const row = stats.find((s) => s.label === key);
    if (row) picked.push({ ...row, label: labelMap[key] || row.label });
  }
  return picked;
}

export function riskOverviewMetrics(workbench: WorkbenchData, risk: string, confidence: number | null) {
  const stat = (label: string) =>
    workbench.statistics.find((s) => s.label === label)?.value ?? "—";
  const top = workbench.confirmed_findings[0];
  const sem = top ? semanticConfidence(top) : null;
  const confLabel = sem
    ? `${CONFIDENCE_METRIC_LABEL[sem.primary.metric]}`
    : "Confidence";
  const confValue =
    sem?.primary.score != null
      ? `${sem.primary.score}%`
      : confidence != null
        ? `${confidence}%`
        : "—";
  return [
    { label: "Risk", value: risk, highlight: true },
    { label: confLabel, value: confValue, highlight: true },
    { label: "Findings", value: workbench.totals.confirmed_findings ?? stat("Validated Findings"), highlight: true },
    { label: "Assets", value: stat("Assets") },
    { label: "Files", value: workbench.totals.files },
    { label: "Paths", value: `${workbench.totals.validated_paths} / ${workbench.totals.rejected_paths}` },
    { label: "Correlations", value: workbench.totals.cross_source_matches },
  ];
}

export function uniqueWhyItMatters(findings: WorkbenchConfirmedFinding[]): string | null {
  const texts = [...new Set(findings.map((f) => f.why_it_matters).filter(Boolean))];
  if (texts.length === 1) return texts[0];
  return null;
}

export interface InvestigationSummary {
  title: string;
  host: string;
  confidence: number;
  confidenceLabel: string;
  scannersAgree: number;
  internetExposed: boolean;
  knownExploit: boolean;
  businessImpact: string;
  nextStep: string;
  expectedGain: number;
}

function findingHasExploit(finding: WorkbenchConfirmedFinding): boolean {
  if (finding.cve) return true;
  if (finding.confidence?.exploit) return true;
  const haystack = [...finding.evidence, ...finding.reasoning].join(" ").toLowerCase();
  return /cve-\d|exploit|metasploit|poc|rce|remote code/.test(haystack);
}

function findingInternetExposed(
  finding: WorkbenchConfirmedFinding,
  workbench: WorkbenchData,
): boolean {
  if (finding.validated_checks.some((c) => /reachable|entry point|internet|external/i.test(c))) {
    return true;
  }
  const host = finding.host;
  return workbench.candidate_paths.some((p) => {
    const steps = p.steps.join(" ").toLowerCase();
    return steps.includes("internet") && (!host || steps.includes(host.toLowerCase()));
  });
}

export function investigationSummary(workbench: WorkbenchData): InvestigationSummary | null {
  const top = workbench.confirmed_findings[0];
  if (!top) return null;

  const sem = semanticConfidence(top);
  const confidence = sem?.primary.score ?? top.machine_confidence;
  const confidenceLabel = sem
    ? `${CONFIDENCE_METRIC_LABEL[sem.primary.metric]} confidence`
    : "Confidence";
  const missing = missingEvidenceRows(workbench);
  const expectedGain =
    missing[0]?.expected_gain && missing[0].expected_gain > 0
      ? missing[0].expected_gain
      : Math.min(
          Math.max(0, 100 - confidence),
          Math.max(3, Math.round(Math.max(0, 100 - confidence) * 0.55)),
        );

  const nextStep =
    missing[0]?.topic ||
    workbench.next_actions[0] ||
    "Attempt exploit reproduction to confirm the strongest exposure.";

  const impact =
    top.business_impact_detail?.summary ||
    top.business_impact ||
    top.why_it_matters ||
    "Successful exploitation could compromise the affected service.";

  return {
    title: top.title,
    host: top.host || "—",
    confidence,
    confidenceLabel,
    scannersAgree: top.sources.length,
    internetExposed: findingInternetExposed(top, workbench),
    knownExploit: findingHasExploit(top),
    businessImpact: impact,
    nextStep,
    expectedGain,
  };
}
