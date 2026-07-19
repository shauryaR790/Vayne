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
    meaning: "Independent evidence supports that this finding is genuine.",
  },
  Rejected: {
    label: "Rejected",
    meaning: "Evidence contradicts this finding; it was not retained.",
  },
};

export function statusMeaning(status: WorkbenchConfirmedFinding["status"]) {
  return STATUS_MEANING[status] ?? STATUS_MEANING.Observed;
}

/** Display status reconciled with exploit confidence — avoids "Validated" when exploit proof is low. */
export function findingDisplayStatus(finding: WorkbenchConfirmedFinding): {
  label: string;
  meaning: string;
} {
  const sem = semanticConfidence(finding);
  const exploitScore =
    sem?.exploit?.score ??
    (sem?.primary.metric === "exploit" ? sem.primary.score : null);

  if (
    (finding.status === "Validated" || finding.status === "Correlated") &&
    exploitScore != null &&
    exploitScore < 55
  ) {
    return {
      label: "Needs validation",
      meaning:
        "The exposure is documented in evidence, but successful exploitation has not been demonstrated in this environment.",
    };
  }

  return statusMeaning(finding.status);
}

/** Presentation polish for engine-generated prose. */
export function polishEngineText(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return trimmed;
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
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

/** One-line definition shown above the score — what this number actually measures. */
export const CONFIDENCE_METRIC_DEFINITION: Record<WorkbenchConfidenceMetricKey, string> = {
  observation:
    "How sure VANE is the top finding exists on the target — from banners, fingerprints, and scanner evidence.",
  correlation:
    "How strongly independent scanners agree on the top finding — not whether it exists once, but whether sources match.",
  exploit:
    "How sure VANE is the top finding can be exploited in practice — observation alone is not enough for this score.",
};

export const ATTACK_SURFACE_DEFINITION =
  "How exposed the environment looks from attack paths VANE explored — path count, blast radius, and path risk. This is potential impact topology, not proof that exploitation succeeded.";

export interface ConfidenceBand {
  word: string;
  sentence: string;
}

/** A number is never shown alone — pair it with a band word + sentence (P4). */
export function confidenceBand(score: number): ConfidenceBand {
  if (score >= 80) {
    return { word: "Strong evidence", sentence: "Multiple signals support this finding." };
  }
  if (score >= 55) {
    return { word: "Partial evidence", sentence: "Supported, but validation gaps remain." };
  }
  if (score >= 30) {
    return { word: "Weak evidence", sentence: "Treat as unconfirmed until validated." };
  }
  return { word: "Insufficient evidence", sentence: "Not enough proof to act on yet." };
}

/** Remove duplicate list numbering from engine or LLM text. */
export function stripLeadingEnumeration(text: string): string {
  return text.replace(/^\s*\d+[.)]\s+/, "").trim();
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
  const sc = finding.investigation?.self_challenge;
  const out: string[] = [];

  if (sc?.what_would_overturn?.length) {
    for (const item of sc.what_would_overturn) {
      if (item?.trim()) out.push(item.trim());
      if (out.length >= 4) return out;
    }
  }

  if (sc?.challenges?.length) {
    for (const c of sc.challenges) {
      if (!c.weakens) continue;
      const line = c.question?.replace(/\?$/, "") || c.answer;
      if (line && !out.includes(line)) out.push(line);
      if (out.length >= 4) return out;
    }
  }

  const loop = finding.investigation?.validation_loop;
  if (loop && !loop.exploit_confirmed) {
    out.push("A failed exploit replay would lower exploit confidence");
  }
  for (const c of finding.not_validated_checks || []) {
    out.push(`This could be incorrect if ${prettyCheck(c).toLowerCase()} contradicts the finding`);
    if (out.length >= 4) break;
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
    const cleaned = stripLeadingEnumeration(action);
    const { gain, topic } = matchGain(cleaned);
    return {
      action: cleaned,
      expectedResult: expectedFor(cleaned, topic),
      expectedGain: gain,
    };
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
  const score =
    sem?.primary.score ?? (confidence != null ? confidence : top?.machine_confidence ?? null);
  const band = score != null ? confidenceBand(score) : null;
  return [
    {
      label: "Attack surface",
      value: risk,
      highlight: true,
      sub: "Exposure if paths hold",
    },
    {
      label: "Evidence strength",
      value: band?.word ?? (score != null ? `${score}%` : "—"),
      highlight: true,
      sub:
        score != null && band
          ? `${score}% — ${band.sentence}`
          : "How strongly evidence supports the top finding",
    },
    {
      label: "Retained findings",
      value: workbench.totals.confirmed_findings ?? stat("Validated Findings"),
      highlight: true,
      sub: "Passed evidence review",
    },
    { label: "Assets", value: stat("Assets"), sub: "Hosts in scope" },
    { label: "Files", value: workbench.totals.files, sub: "Evidence uploaded" },
    {
      label: "Paths",
      value: `${workbench.totals.validated_paths} / ${workbench.totals.rejected_paths}`,
      sub: "Validated / rejected",
    },
    {
      label: "Correlations",
      value: workbench.totals.cross_source_matches,
      sub: "Cross-scanner matches",
    },
  ];
}

export function uniqueWhyItMatters(findings: WorkbenchConfirmedFinding[]): string | null {
  const texts = [...new Set(findings.map((f) => f.why_it_matters).filter(Boolean))];
  if (texts.length === 1) return texts[0];
  return null;
}

export interface ConfidenceContributor {
  label: string;
  delta: number;
}

export interface ConfidenceIncreaseItem {
  item: string;
  explanation?: string;
  gain?: number | null;
}

/** Phase 3 — structured explainability mapped from engine fields only. */
export interface FindingExplainability {
  whatHappened: string;
  whyBelieve: string[];
  whatCouldBeWrong: string[];
  confidenceWouldIncrease: ConfidenceIncreaseItem[];
  finalConclusion: string;
}

export function confidenceContributors(
  finding: WorkbenchConfirmedFinding,
): { score: number; contributors: ConfidenceContributor[] } {
  const sem = semanticConfidence(finding);
  const primary = sem?.primary;
  const metric =
    (primary && sem?.[primary.metric]) ||
    sem?.observation ||
    null;
  const score = primary?.score ?? finding.machine_confidence;
  const contributors: ConfidenceContributor[] = (metric?.factors || finding.confidence_factors || [])
    .map((f) => ({ label: f.label, delta: f.delta }))
    .slice(0, 8);
  return { score, contributors };
}

export function buildFindingExplainability(finding: WorkbenchConfirmedFinding): FindingExplainability {
  const inv = finding.investigation;
  const sc = inv?.self_challenge;

  const proofLine = finding.proof?.[0]?.detail || finding.evidence[0] || "";
  const whatHappened =
    inv?.conclusion?.split(/(?<=[.!?])\s+/)[0]?.trim() ||
    (proofLine
      ? `${finding.title}${finding.host ? ` on ${finding.host}` : ""} — ${proofLine}`
      : `${finding.title}${finding.host ? ` was identified on ${finding.host}` : ""}.`);
  const polishedWhat = polishEngineText(whatHappened);

  const human = inv?.human_reasoning || [];
  let whyBelieve: string[] = [];
  if (human.length) {
    whyBelieve = human.slice(0, 6);
  } else {
    for (const c of finding.validated_checks || []) {
      whyBelieve.push(prettyCheck(c));
    }
    if (finding.unique_reason) whyBelieve.unshift(finding.unique_reason);
    if (!whyBelieve.length) whyBelieve = finding.reasoning.slice(0, 5);
    whyBelieve = [...new Set(whyBelieve)].slice(0, 6);
  }

  let whatCouldBeWrong = uncertaintyFactors(finding);
  if (sc?.challenges?.length) {
    const fromChallenges = sc.challenges
      .filter((c) => c.weakens)
      .map((c) => {
        const q = c.question?.replace(/\?$/, "").trim();
        return q ? `${q.charAt(0).toUpperCase()}${q.slice(1)}` : c.answer;
      })
      .filter((v): v is string => Boolean(v));
    if (fromChallenges.length) whatCouldBeWrong = [...new Set([...fromChallenges, ...whatCouldBeWrong])].slice(0, 5);
  }

  const confidenceWouldIncrease: ConfidenceIncreaseItem[] = [];
  for (const t of inv?.investigation_tasks || []) {
    confidenceWouldIncrease.push({
      item: t.action,
      explanation: t.detail || t.expected_result,
      gain: t.expected_gain ?? null,
    });
    if (confidenceWouldIncrease.length >= 4) break;
  }
  for (const p of inv?.validation_loop?.next_probes || []) {
    if (confidenceWouldIncrease.some((x) => x.item === p.name)) continue;
    confidenceWouldIncrease.push({
      item: p.name,
      explanation: p.confirms,
      gain: p.expected_gain ?? null,
    });
    if (confidenceWouldIncrease.length >= 5) break;
  }

  const finalConclusion =
    inv?.conclusion?.trim() ||
    sc?.verdict?.trim() ||
    finding.unique_reason ||
    finding.reasoning[finding.reasoning.length - 1] ||
    statusMeaning(finding.status).meaning;

  return {
    whatHappened: polishedWhat,
    whyBelieve,
    whatCouldBeWrong,
    confidenceWouldIncrease,
    finalConclusion,
  };
}

export interface ExecutiveSummaryPanel {
  highestPriorityFinding: string;
  highestPriorityHost: string;
  overallConfidence: number | null;
  confidenceLabel: string;
  confidenceMetric: WorkbenchConfidenceMetricKey;
  confidenceDefinition: string;
  confidenceMeaning: string;
  riskLevel: string;
  riskDefinition: string;
  findingSeverity: string | null;
  recommendedNextAction: string;
  analystSummary: string;
}

export type ReadableVerdictTone = "confirmed" | "action" | "clear" | "neutral";

/** Plain-language verdict for the executive summary — one story, numbers optional. */
export interface ReadableVerdict {
  statusLabel: string;
  tone: ReadableVerdictTone;
  headline: string;
  summary: string;
  whatWeKnow: string;
  stillOpen: string | null;
  whyRespond: string;
  nextAction: string;
  panel: ExecutiveSummaryPanel;
}

export function buildReadableVerdict(
  workbench: WorkbenchData,
  risk: string,
  graphConfidence: number | null,
): ReadableVerdict {
  const panel = executiveSummaryPanel(workbench, risk, graphConfidence);
  const top = workbench.confirmed_findings[0];
  const explain = top ? buildFindingExplainability(top) : null;

  if (!top) {
    return {
      statusLabel: "No findings",
      tone: "clear",
      headline: "Nothing met the retention threshold",
      summary: panel.analystSummary,
      whatWeKnow: "VANE finished review but no finding had enough evidence to keep.",
      stillOpen: null,
      whyRespond: "No immediate action on retained findings.",
      nextAction: panel.recommendedNextAction,
      panel,
    };
  }

  const score = panel.overallConfidence;
  const metric = panel.confidenceMetric;
  const status = top.status;
  const severity = (top.severity || "medium").toLowerCase();
  const isHighImpact = severity === "critical" || severity === "high" || /high|critical/i.test(risk);

  let statusLabel = "Review";
  let tone: ReadableVerdictTone = "action";
  let headline = "Finding retained — review recommended";

  if (status === "Validated" || (metric === "exploit" && score != null && score >= 75)) {
    statusLabel = "Confirmed";
    tone = "confirmed";
    headline = "VANE confirmed this exposure";
  } else if (metric === "exploit" && score != null && score < 55) {
    statusLabel = "Needs validation";
    tone = "action";
    headline = isHighImpact
      ? "Serious issue found — exploitation not proven yet"
      : "Exposure found — exploitation not proven yet";
  } else if (status === "Observed") {
    statusLabel = "Observed";
    tone = "action";
    headline = "Scanner saw it — VANE has not fully validated it";
  } else if (status === "Correlated") {
    statusLabel = "Correlated";
    tone = "action";
    headline = "Multiple sources agree — next step is validation";
  }

  const summary =
    explain?.finalConclusion ||
    top.unique_reason ||
    panel.analystSummary;

  const whatWeKnow = explain?.whatHappened || summary;

  let stillOpen: string | null = null;
  if (metric === "exploit" && score != null && score < 55) {
    stillOpen =
      "Whether an attacker can actually exploit this here — no successful replay or authenticated proof yet.";
  } else if (top.not_validated_checks[0]) {
    stillOpen = top.not_validated_checks[0];
  } else if (explain?.whatCouldBeWrong[0]) {
    stillOpen = explain.whatCouldBeWrong[0];
  }

  let whyRespond = top.why_it_matters || "";
  if (!whyRespond && isHighImpact) {
    whyRespond =
      `Rated ${top.severity} severity on a reachable asset. Even without exploit proof, the potential impact justifies validating before deprioritizing.`;
  } else if (!whyRespond) {
    whyRespond = "Retained because supporting evidence outweighed gaps — validation still recommended.";
  }

  return {
    statusLabel,
    tone,
    headline,
    summary,
    whatWeKnow,
    stillOpen,
    whyRespond,
    nextAction: panel.recommendedNextAction,
    panel,
  };
}

export function executiveSummaryPanel(
  workbench: WorkbenchData,
  risk: string,
  graphConfidence: number | null,
): ExecutiveSummaryPanel {
  const top = workbench.confirmed_findings[0];
  const sem = top ? semanticConfidence(top) : null;
  const confKey = sem?.primary.metric ?? "observation";
  const score = sem?.primary.score ?? graphConfidence ?? top?.machine_confidence ?? null;
  const tasks = recommendationTasks(workbench);
  const nextAction = tasks[0]?.action || workbench.next_actions[0] || "Review retained findings and validate top exposure.";

  return {
    highestPriorityFinding: top?.title ?? "No retained findings",
    highestPriorityHost: top?.host ?? "—",
    overallConfidence: score,
    confidenceLabel: score != null ? `${CONFIDENCE_METRIC_LABEL[confKey]} confidence` : "Confidence",
    confidenceMetric: confKey,
    confidenceDefinition: CONFIDENCE_METRIC_DEFINITION[confKey],
    confidenceMeaning: score != null ? confidenceMeaning(confKey, score) : "No findings met the retention threshold.",
    riskLevel: risk,
    riskDefinition: ATTACK_SURFACE_DEFINITION,
    findingSeverity: top?.severity ?? null,
    recommendedNextAction: nextAction,
    analystSummary: workbench.executive_summary || investigationVerdict(workbench).headline,
  };
}

export interface InvestigationStoryStep {
  label: string;
  detail?: string;
  done: boolean;
}

/** Chronological investigation story from engine stages when available. */
export function investigationStorySteps(workbench: WorkbenchData): InvestigationStoryStep[] {
  const top = workbench.confirmed_findings[0];
  const engineStages = top?.investigation?.stages;
  if (engineStages?.length) {
    return engineStages.map((s) => ({
      label: s.label,
      detail: s.detail,
      done: s.complete !== false,
    }));
  }

  const hasHypotheses = workbench.confirmed_findings.some(
    (f) => (f.investigation?.hypotheses?.length || 0) > 0,
  );
  const rejected = workbench.candidate_paths.filter((p) => p.status === "REJECTED").length;

  return [
    { label: "Evidence collected", done: workbench.evidence_sources.length > 0, detail: `${workbench.totals?.sources ?? workbench.evidence_sources.length} source(s)` },
    { label: "Services discovered", done: Boolean(workbench.statistics.find((s) => s.label === "Services")), detail: undefined },
    { label: "Versions confirmed", done: workbench.confirmed_findings.some((f) => f.evidence_summary?.version), detail: undefined },
    { label: "Correlations built", done: (workbench.totals?.cross_source_matches ?? 0) > 0, detail: `${workbench.totals?.cross_source_matches ?? 0} cross-source match(es)` },
    { label: "Hypotheses created", done: hasHypotheses, detail: undefined },
    { label: "Alternative explanations rejected", done: rejected > 0 || hasHypotheses, detail: rejected ? `${rejected} path(s) ruled out` : undefined },
    { label: "Final conclusion", done: workbench.confirmed_findings.length > 0, detail: top?.investigation?.conclusion?.slice(0, 120) },
  ];
}

export interface EvidenceTimelineStep {
  label: string;
  detail?: string;
  delta?: number;
  source?: string;
}

/** Per-finding or investigation-wide evidence → confidence chain (Phase 3 §4). */
export function evidenceTimelineSteps(
  workbench: WorkbenchData,
  finding?: WorkbenchConfirmedFinding,
): EvidenceTimelineStep[] {
  const target = finding ?? workbench.confirmed_findings[0];
  const evolution =
    target?.confidence_timeline ||
    target?.investigation?.confidence_evolution ||
    [];
  if (evolution.length) {
    return evolution.map((e) => ({
      label: e.event,
      detail: e.detail,
      delta: e.delta,
      source: e.kind,
    }));
  }

  const steps: EvidenceTimelineStep[] = [];
  const sources = target?.sources?.length
    ? target.sources
    : workbench.evidence_sources.map((s) => s.label);
  for (const src of sources.slice(0, 1)) {
    steps.push({ label: src, detail: "Scanner evidence ingested" });
  }
  for (const row of target?.proof || []) {
    steps.push({ label: "Banner collected", detail: row.detail, source: row.source });
  }
  if (target?.evidence_summary?.version) {
    steps.push({ label: "Version parsed", detail: target.evidence_summary.version });
  }
  if (target?.validated_checks?.length) {
    steps.push({
      label: "Fingerprint matched",
      detail: prettyCheck(target.validated_checks[0]),
    });
  }
  if (target?.scanner_agreement?.agreed?.length) {
    steps.push({
      label: "Confidence increased",
      detail: `${target.scanner_agreement.agreed.length} scanner(s) agree`,
      delta: undefined,
    });
  }
  if (target) {
    steps.push({
      label: "Finding retained",
      detail: target.unique_reason || statusMeaning(target.status).meaning,
    });
  }

  const trail = workbench.evidence_trail || [];
  if (!steps.length && trail.length) {
    return trail.map((e) => ({ label: e.event, detail: e.detail, source: e.kind }));
  }
  return steps;
}

export interface MissingEvidenceChecklistItem {
  topic: string;
  whyItMatters: string;
  confidenceChange: string;
  checked: boolean;
}

/** Investigation checklist from engine missing-evidence rows (Phase 3 §6). */
export function missingEvidenceChecklist(workbench: WorkbenchData): MissingEvidenceChecklistItem[] {
  return missingEvidenceRows(workbench).map((row) => ({
    topic: row.topic,
    whyItMatters: row.reason || row.evidence_needed,
    confidenceChange: row.expected_gain
      ? `Would add roughly +${row.expected_gain}% to relevant confidence if confirmed`
      : "Would strengthen the conclusion if obtained",
    checked: false,
  }));
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
  whatCouldHappen?: string;
  whoIsAtRisk?: string;
  businessAreas?: string;
  score?: number;
}

/** Business impact of the retained findings — plain language for executives. */
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
      whatCouldHappen: detail?.importance || detail?.attacker_gains,
      whoIsAtRisk: detail?.systems_exposed,
      businessAreas: detail?.process_affected,
      score: (detail as { score?: number } | undefined)?.score,
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
