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

// --------------------------------------------------------------------------- //
// Self-explaining vocabulary — the UI teaches itself (Principles 1, 6, 12).
// Every state / number is paired with a plain-language meaning so a first-time
// user never sees an unexplained term or a naked percentage.
// --------------------------------------------------------------------------- //
export const STATUS_MEANING: Record<
  WorkbenchConfirmedFinding["status"],
  { label: string; meaning: string }
> = {
  Observed: {
    label: "Observed",
    meaning: "Detected by a scanner but not yet independently verified.",
  },
  Correlated: {
    label: "Correlated",
    meaning: "Confirmed by more than one independent source of evidence.",
  },
  Hypothesized: {
    label: "Hypothesized",
    meaning: "Inferred from partial evidence; still being tested by the engine.",
  },
  Validated: {
    label: "Validated",
    meaning: "Evidence confirms this finding is genuine and exploitable.",
  },
  Rejected: {
    label: "Rejected",
    meaning: "Evidence contradicts this finding; it was not retained.",
  },
};

export function statusMeaning(status: WorkbenchConfirmedFinding["status"]) {
  return STATUS_MEANING[status] ?? STATUS_MEANING.Observed;
}

/** Plain-language meaning for a confidence dimension at a given score. */
export function confidenceMeaning(key: WorkbenchConfidenceMetricKey, score: number): string {
  const band = score >= 80 ? "high" : score >= 55 ? "moderate" : score >= 30 ? "low" : "very low";
  const subject: Record<WorkbenchConfidenceMetricKey, string> = {
    observation: "that this service or finding really exists",
    correlation: "that independent scanners agree on what this is",
    exploit: "that this could actually be exploited",
  };
  return `The engine has ${band} confidence ${subject[key]}.`;
}

export interface ConfidenceBand {
  word: string;
  sentence: string;
}

/** A number is never shown alone — pair it with a band word + sentence (P4). */
export function confidenceBand(score: number): ConfidenceBand {
  if (score >= 80) {
    return { word: "High confidence", sentence: "Evidence strongly supports this." };
  }
  if (score >= 55) {
    return { word: "Moderate confidence", sentence: "Evidence supports this, but gaps remain." };
  }
  if (score >= 30) {
    return { word: "Low confidence", sentence: "Limited evidence — treat as unconfirmed." };
  }
  return { word: "Very low confidence", sentence: "Insufficient evidence." };
}

/** Evidence that argues against the finding — conflicts & disagreement (P3). */
export function evidenceAgainst(finding: WorkbenchConfirmedFinding): string[] {
  const out: string[] = [];
  const summary = finding.evidence_summary;
  if (summary && summary.conflicts > 0) {
    out.push(
      summary.conflicts === 1
        ? "One scanner disagrees on version or severity"
        : `${summary.conflicts} scanner conflicts on version or severity`,
    );
  }
  const agreement = finding.scanner_agreement;
  if (agreement) {
    const capable = agreement.capable?.length || 0;
    const agreed = agreement.agreed?.length || 0;
    if (capable > 1 && agreed < capable) {
      out.push(`${capable - agreed} of ${capable} capable scanners did not confirm this`);
    }
  }
  return out.slice(0, 3);
}

/** "What could change this conclusion?" — honest uncertainty (P10). */
export function uncertaintyFactors(finding: WorkbenchConfirmedFinding): string[] {
  const out: string[] = [];
  const loop = finding.investigation?.validation_loop;
  if (loop && !loop.exploit_confirmed) {
    out.push("A failed exploit replay would lower exploit confidence");
  }
  for (const c of finding.not_validated_checks || []) {
    out.push(`A contradiction from ${c.toLowerCase()} would change this`);
    if (out.length >= 3) break;
  }
  if (finding.evidence_summary && finding.evidence_summary.conflicts > 0) {
    out.push("Resolving the scanner conflict could raise or lower confidence");
  }
  if (!out.length) out.push("New contradicting evidence would change this conclusion");
  return out.slice(0, 4);
}

export interface RecommendationTask {
  action: string;
  expectedResult: string;
  expectedGain: number | null;
}

/** Recommendations rendered as executable investigation tasks (P8). */
export function recommendationTasks(workbench: WorkbenchData): RecommendationTask[] {
  const missing = missingEvidenceRows(workbench);
  const matchGain = (action: string): { gain: number | null; topic: string } => {
    const a = action.toLowerCase();
    let best: { gain: number | null; topic: string } = { gain: null, topic: "" };
    for (const m of missing) {
      const words = m.topic.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      if (words.some((w) => a.includes(w))) {
        best = { gain: m.expected_gain || null, topic: m.topic };
        break;
      }
    }
    return best;
  };
  const expectedFor = (action: string, topic: string): string => {
    const a = action.toLowerCase();
    if (/replay|reproduc|exploit|poc/.test(a)) return "Confirm the exposure is actually exploitable";
    if (/auth|credential|login/.test(a)) return "Validate the privilege boundary";
    if (/log|siem/.test(a)) return "Confirm whether the activity actually occurred";
    if (/scan|second|re-?scan|verify/.test(a)) return "Independently confirm the observation";
    return topic ? `Resolve: ${topic.toLowerCase()}` : "Move the finding toward validated";
  };
  return (workbench.next_actions || []).slice(0, 8).map((action) => {
    const { gain, topic } = matchGain(action);
    return { action, expectedResult: expectedFor(action, topic), expectedGain: gain };
  });
}

/** Badge tooltips — hover teaches the user (P5). */
export const BADGE_MEANING: Record<string, string> = {
  Observed:
    "Detected by a scanner but not independently verified. Confidence stays capped until confirmed.",
  Correlated:
    "More than one independent source reports the same thing, which raises confidence.",
  Hypothesized:
    "Inferred from partial evidence. The engine is still testing this explanation.",
  Validated:
    "Evidence confirms the finding is genuine and exploitable — the highest trust state.",
  Rejected:
    "Evidence contradicts this finding, so it was not retained.",
  Confirmed:
    "Exploitability is proven by authenticated or reproduced evidence in the scan.",
  Inferred:
    "Exploitability is reasoned from context, not yet proven by replay or authentication.",
};

export interface EvidenceCheck {
  label: string;
  ok: boolean;
}

/**
 * A visual ✓ / ✗ readout of what evidence exists for a finding (Principle 7).
 * Built from the engine's validated / not-validated checks, scanner agreement,
 * version confidence, and the Phase-4 validation loop — deduplicated and capped.
 */
export function evidenceChecklist(finding: WorkbenchConfirmedFinding): EvidenceCheck[] {
  const out: EvidenceCheck[] = [];
  const seen = new Set<string>();
  const push = (label: string, ok: boolean) => {
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, ok });
  };

  for (const c of finding.validated_checks || []) push(prettyCheck(c), true);
  for (const c of finding.not_validated_checks || []) push(prettyCheck(c), false);

  const agreement = finding.scanner_agreement;
  if (agreement && (agreement.capable?.length || 0) > 1) {
    push("Second scanner confirmation", (agreement.agreed?.length || 0) >= 2);
  }
  const summary = finding.evidence_summary;
  if (summary?.version_confidence) {
    push("Version identified", summary.version_confidence >= 60);
  }
  const loop = finding.investigation?.validation_loop;
  if (loop) {
    push("Exploit reproduced", Boolean(loop.exploit_confirmed));
    push("Authenticated validation", Boolean(loop.verification?.authenticated));
  }
  return out.slice(0, 8);
}

function prettyCheck(raw: string): string {
  return raw.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()).trim();
}

export interface ExploitVerification {
  confirmed: boolean;
  label: string;
  detail: string;
  probes: Array<{ name: string; gain: number }>;
}

/**
 * Verified-vs-inferred exploitability (Phase 4 validation loop). Answers
 * "could an attacker realistically exploit this?" honestly — never presents
 * inferred exploitability as proven.
 */
export function exploitVerification(finding: WorkbenchConfirmedFinding): ExploitVerification | null {
  const loop = finding.investigation?.validation_loop;
  if (!loop) return null;
  const probes = (loop.next_probes || [])
    .map((p) => ({ name: p.name, gain: p.expected_gain || 0 }))
    .slice(0, 4);
  if (loop.exploit_confirmed) {
    return {
      confirmed: true,
      label: "Exploitability confirmed",
      detail:
        loop.verification?.label && loop.reason
          ? loop.reason
          : "Verified by authenticated or reproduced evidence in the scan.",
      probes,
    };
  }
  return {
    confirmed: false,
    label: "Exploitability inferred",
    detail:
      loop.reason ||
      "No replay, authenticated re-check, or reproduction has verified this yet.",
    probes,
  };
}

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

export interface InvestigationVerdict {
  headline: string;
  counts: Array<{ label: string; value: string }>;
  topFinding: string | null;
  topHost: string | null;
}

/** "What did VANE discover?" — the one-glance verdict (Principles 2, 3, 12). */
export function investigationVerdict(workbench: WorkbenchData): InvestigationVerdict {
  const findings = workbench.confirmed_findings || [];
  const top = findings[0] || null;
  const validatedPaths = workbench.totals?.validated_paths ?? 0;
  const rejectedPaths = workbench.totals?.rejected_paths ?? 0;
  const counts: Array<{ label: string; value: string }> = [
    { label: "Findings retained", value: String(findings.length) },
    { label: "Evidence sources", value: String(workbench.totals?.sources ?? workbench.evidence_sources.length) },
    { label: "Attack paths that hold up", value: String(validatedPaths) },
    { label: "Paths ruled out", value: String(rejectedPaths) },
  ];
  return {
    headline:
      workbench.executive_summary ||
      (findings.length
        ? `VANE retained ${findings.length} finding${findings.length === 1 ? "" : "s"} after discarding what the evidence could not support.`
        : "VANE completed the investigation and no findings met the evidence threshold."),
    counts,
    topFinding: top?.title ?? null,
    topHost: top?.host ?? null,
  };
}

export interface BusinessImpactRow {
  id: string;
  title: string;
  host: string;
  summary: string;
  attacker_gains?: string;
  systems_exposed?: string;
  process_affected?: string;
}

/** Business impact of the retained findings — summarizes, never introduces (P8). */
export function businessImpactRows(workbench: WorkbenchData): BusinessImpactRow[] {
  const out: BusinessImpactRow[] = [];
  const seen = new Set<string>();
  for (const f of workbench.confirmed_findings || []) {
    const detail = f.business_impact_detail;
    const summary = detail?.summary || f.business_impact || f.why_it_matters;
    if (!summary) continue;
    const key = summary.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: f.id,
      title: f.title,
      host: f.host || "—",
      summary,
      attacker_gains: detail?.attacker_gains,
      systems_exposed: detail?.systems_exposed,
      process_affected: detail?.process_affected,
    });
    if (out.length >= 4) break;
  }
  return out;
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
