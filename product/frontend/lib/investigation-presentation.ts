import type { InvestigationBundle } from "./investigation-bundle";
import type { AttackPathSummary, Finding, GraphData } from "./types";
import { buildInvestigationCardMetaFromBundle } from "./investigation-metadata";
import { matchSourceFile, parseUploadedFilenames } from "./source-attribution";
import {
  avgConfidence,
  parseRejectedChains,
  type RejectedChain,
} from "./report-helpers";

export interface ExecutiveMetrics {
  risk: string;
  assets: number;
  validatedFindings: number;
  attackPaths: number;
  blastRadius: number;
  analystNote: string;
}

export interface AttackChainPresentation {
  steps: string[];
  confidence: number;
  blastRadius: number;
  riskScore: number;
  mitreTags: string[];
  title: string;
  analystNote: string;
}

export interface FindingsBreakdown {
  critical: number;
  high: number;
  medium: number;
  low: number;
  analystNote: string;
}

export interface FindingCardData {
  id: string;
  asset: string;
  finding: string;
  sourceFile?: string;
  confidence: number;
  exploitability: string;
  businessImpact: string;
  evidenceCount: number;
  riskScore: number;
  remediationPriority: string;
  beliefReasons: string[];
  analystNote: string;
}

export interface ValidatedChainPresentation {
  id: string;
  steps: string[];
  sourceFile?: string;
  confidence: number;
  riskScore: number;
  blastRadius: number;
  mitreTags: string[];
  category: string;
  analystNote: string;
}

export interface RejectedChainPresentation {
  steps: string[];
  reason: string;
  missingEvidence: string;
  deadEnd: string;
  analystNote: string;
}

export interface InvestigationPresentation {
  investigationId: string;
  sourceLabel: string;
  executive: ExecutiveMetrics;
  topPath: AttackChainPresentation | null;
  breakdown: FindingsBreakdown;
  findings: FindingCardData[];
  validatedChains: ValidatedChainPresentation[];
  rejectedChains: RejectedChainPresentation[];
  graphAnalystNote: string;
  chainsAnalystNote: string;
  graph: GraphData;
  hasPaths: boolean;
  rejectedPathCount: number;
  graphConfidence: number | null;
}

function severityBucket(classification?: string): keyof FindingsBreakdown {
  const c = (classification || "").toLowerCase();
  if (c.includes("critical")) return "critical";
  if (c.includes("high")) return "high";
  if (c.includes("medium") || c.includes("moderate")) return "medium";
  return "low";
}

function buildBeliefReasons(f: Finding): string[] {
  const reasons: string[] = [];
  for (const line of f.reasoning || []) {
    const trimmed = line.trim();
    if (trimmed && !reasons.includes(trimmed)) reasons.push(trimmed);
  }
  for (const ev of f.evidence || []) {
    const trimmed = ev.trim();
    if (trimmed && !reasons.some((r) => r.includes(trimmed))) {
      reasons.push(trimmed.endsWith(".") ? trimmed : `${trimmed}.`);
    }
  }
  const confidence = Math.round(f.confidence ?? 0);
  if (!reasons.length) {
    reasons.push("Service context and exposure were correlated against exploit preconditions.");
  }
  if (!reasons.some((r) => r.toLowerCase().includes("confidence"))) {
    reasons.push(`Confidence score computed as ${confidence}%.`);
  }
  return reasons.slice(0, 5);
}

function findingAnalystNote(f: Finding, beliefReasons: string[]): string {
  const confidence = Math.round(f.confidence ?? 0);
  const title = f.title || f.cve || "this exposure";
  const host = f.host || "the target asset";
  const parts = [
    `VAYNE retained ${title} on ${host} after cross-checking ${f.evidence?.length ?? 0} evidence signal${(f.evidence?.length ?? 0) === 1 ? "" : "s"} against service context.`,
    beliefReasons[0] || "",
    confidence >= 80
      ? "This finding directly strengthens the validated attack path and elevates remediation priority."
      : "This finding provides supporting correlation rather than an independent compromise path.",
  ].filter(Boolean);
  return parts.slice(0, 4).join(" ");
}
function findingCard(
  f: Finding,
  index: number,
  sourceFilenames: string[],
): FindingCardData {
  const confidence = Math.round(f.confidence ?? 0);
  const classification = (f.classification || "observed").toUpperCase();
  const evidenceCount = f.evidence?.length ?? 0;
  const beliefReasons = buildBeliefReasons(f);
  const sourceFile = matchSourceFile(sourceFilenames, {
    sources: f.evidence,
  });

  return {
    id: f.id || `finding-${index}`,
    asset: f.host || "Unknown asset",
    finding: f.title || f.cve || "Validated exposure",
    sourceFile,
    confidence,
    exploitability: classification.includes("CONFIRMED")
      ? "Confirmed"
      : classification.includes("LIKELY")
        ? "Likely"
        : "Observed",
    businessImpact:
      confidence >= 85
        ? "High — direct compromise path"
        : confidence >= 65
          ? "Elevated — lateral risk"
          : "Moderate — contained exposure",
    evidenceCount,
    riskScore: Math.min(10, Math.max(1, Math.round(confidence / 10))),
    remediationPriority:
      confidence >= 80 ? "P1 — Immediate" : confidence >= 60 ? "P2 — This sprint" : "P3 — Scheduled",
    beliefReasons,
    analystNote: findingAnalystNote(f, beliefReasons),
  };
}

function pathSteps(path: AttackPathSummary): string[] {
  return path.title
    .split(/\s*→\s*|\s*>\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function validatedChainAnalystNote(path: AttackPathSummary): string {
  const steps = pathSteps(path);
  const entry = steps[0] || "entry";
  return [
    `This chain was retained at ${path.confidence}% confidence with blast radius ${path.blast_radius}.`,
    `Exposure from ${entry} through ${steps.length} stages satisfied exploitability and post-exploitation preconditions simultaneously.`,
    "Other candidate paths were rejected because required evidence links did not meet the validation threshold.",
  ].join(" ");
}

function rejectedChainAnalystNote(chain: RejectedChainPresentation): string {
  return [
    `VAYNE explored this branch but rejected it: ${chain.reason}.`,
    chain.missingEvidence,
    chain.deadEnd,
  ].join(" ");
}

function validatedChain(path: AttackPathSummary): ValidatedChainPresentation {
  const presentation: ValidatedChainPresentation = {
    id: path.id,
    steps: pathSteps(path),
    confidence: path.confidence,
    riskScore: path.risk,
    blastRadius: path.blast_radius,
    mitreTags: path.mitre_tactics || [],
    category: path.category,
    analystNote: "",
  };
  presentation.analystNote = validatedChainAnalystNote(path);
  return presentation;
}

function inferMissingEvidence(reason: string): string {
  const lower = reason.toLowerCase();
  if (lower.includes("credential")) return "Required credential or authentication evidence was not observed.";
  if (lower.includes("confidence") || lower.includes("threshold")) {
    return "Aggregate chain confidence did not meet the validation threshold.";
  }
  if (lower.includes("exploit") || lower.includes("poc")) {
    return "Exploit intelligence or proof-of-concept applicability was insufficient.";
  }
  if (lower.includes("privilege") || lower.includes("escalation")) {
    return "Privilege escalation preconditions were not satisfied.";
  }
  if (lower.includes("version") || lower.includes("banner")) {
    return "Version fingerprint alone did not confirm vulnerable release.";
  }
  return "Required evidence links between chain stages were incomplete.";
}

function inferDeadEnd(reason: string): string {
  const lower = reason.toLowerCase();
  if (lower.includes("prune") || lower.includes("depth")) return "Search terminated — path depth exceeded without reaching impact.";
  if (lower.includes("target") || lower.includes("business")) {
    return "No downstream business-critical target was reachable from this branch.";
  }
  return "Chain exploration ended without a validated path to impact.";
}

function rejectedChainPresentation(chain: RejectedChain): RejectedChainPresentation {
  const reason = chain.reason.replace(/_/g, " ");
  const base = {
    steps: chain.steps,
    reason,
    missingEvidence: inferMissingEvidence(chain.reason),
    deadEnd: inferDeadEnd(chain.reason),
    analystNote: "",
  };
  base.analystNote = rejectedChainAnalystNote(base);
  return base;
}

function executiveAnalystNote(bundle: InvestigationBundle, pathCount: number): string {
  const { detail, findings, report } = bundle;
  const validated = findings.validated;
  const assets = report.assets?.length || report.discovered_assets?.length || 1;
  const top = detail.attack_paths[0];

  if (pathCount > 0 && top) {
    const steps = pathSteps(top);
    const terminal = steps[steps.length - 1] || "impact";
    const focal =
      steps.find((s) => /apache|nginx|http|smb|ssh|rdp/i.test(s)) || steps[1] || steps[0];
    const parts = [
      `VAYNE identified ${pathCount} validated attack path${pathCount === 1 ? "" : "s"} capable of leading to ${terminal.toLowerCase()}.`,
      `The environment contains ${validated.length} retained finding${validated.length === 1 ? "" : "s"} across ${assets} asset${assets === 1 ? "" : "s"}.`,
    ];
    if (focal) {
      parts.push(`${focal} represents the most immediate business risk based on exposure and exploit confidence.`);
    }
    const lowSupport = validated.filter((f) => (f.confidence ?? 0) < 65).length;
    if (lowSupport > 0) {
      parts.push(
        "Several lower-confidence findings provide supporting evidence rather than independent compromise paths.",
      );
    }
    return parts.slice(0, 4).join(" ");
  }

  const meta = buildInvestigationCardMetaFromBundle(bundle);
  return (
    meta.summary ||
    "VAYNE completed evidence correlation across the uploaded scan. No path met simultaneous exploitability, exposure, and post-exploitation thresholds."
  );
}

function topPathAnalystNote(path: AttackPathSummary | undefined, rejectedCount: number): string {
  if (!path) {
    return "No attack path met simultaneous exploitability, exposure, and post-exploitation conditions.";
  }
  const parts = [
    "This path was retained because exposure, exploitability, and post-exploitation conditions were all satisfied simultaneously.",
  ];
  if (rejectedCount > 0) {
    parts.push(
      `VAYNE rejected ${rejectedCount} other candidate branch${rejectedCount === 1 ? "" : "es"} due to insufficient evidence or dead-end topology.`,
    );
  }
  parts.push(
    `Confidence ${path.confidence}% reflects correlated service fingerprinting, version validation, and path-level proof factors.`,
  );
  return parts.slice(0, 3).join(" ");
}

function chainsAnalystNote(
  validated: ValidatedChainPresentation[],
  rejected: RejectedChainPresentation[],
): string {
  if (validated.length && rejected.length) {
    return [
      `VAYNE retained ${validated.length} validated chain${validated.length === 1 ? "" : "s"} after exploring and rejecting ${rejected.length} candidate branch${rejected.length === 1 ? "" : "es"}.`,
      "Validated chains represent paths where every stage had sufficient evidence to proceed.",
      "Rejected chains document intelligence value — they show what was considered and why it failed threshold.",
    ].join(" ");
  }
  if (validated.length) {
    return "All displayed chains passed independent exploitability and blast-radius validation. Each stage retained explicit evidence backing the transition.";
  }
  if (rejected.length) {
    return "Although candidate paths were explored, none met the evidence bar for validated exploitation. Rejection reasoning is preserved for analyst review.";
  }
  return "No attack chains were recorded for this evidence set.";
}

function graphAnalystNote(hasPaths: boolean, nodeCount: number, topPath?: AttackPathSummary | null): string {
  if (hasPaths && topPath) {
    const steps = pathSteps(topPath);
    const vector =
      steps.find((s) => /apache|nginx|http|service|software/i.test(s)) || steps[1] || "the exposed service";
    return [
      "The graph illustrates how externally exposed services connect to vulnerable software and downstream impact nodes.",
      `${vector} became the primary attack vector because exposure, exploitability, and post-exploitation edges all aligned.`,
      `${nodeCount} evidence-linked entities were mapped from entry through vulnerability to validated impact.`,
    ].join(" ");
  }
  if (hasPaths) {
    return `The attack graph maps ${nodeCount} evidence-linked entities from entry through vulnerability to validated impact.`;
  }
  return "The graph captures discovered assets and services. No complete exploitation chain was validated across the topology.";
}

export function buildInvestigationPresentation(
  bundle: InvestigationBundle,
  sourceLabel?: string,
  sourceLabels?: string[],
): InvestigationPresentation {
  const { detail, report, findings, graph } = bundle;
  const meta = buildInvestigationCardMetaFromBundle(bundle, sourceLabel);
  const uploadedFilenames = parseUploadedFilenames(
    ...(sourceLabels ?? []),
    sourceLabel,
    report.target,
    report.name,
  );
  const topPath = detail.attack_paths[0];
  const assets = report.assets?.length || report.discovered_assets?.length || 1;
  const validated = findings.validated;
  const stats = report.stats;
  const rawRejected = parseRejectedChains(report);
  const validatedChains = detail.attack_paths.map(validatedChain);
  const rejectedChains = rawRejected.map(rejectedChainPresentation);
  const hasPaths = detail.attack_paths.length > 0;

  const breakdown: FindingsBreakdown = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    analystNote:
      validated.length > 0
        ? "Most findings represent supporting evidence rather than independent compromise paths. Their value comes from strengthening exploit confidence across externally accessible services."
        : "No validated findings met the evidence threshold for retention.",
  };

  for (const f of validated) {
    const bucket = severityBucket(f.classification);
    if (bucket === "critical") breakdown.critical += 1;
    else if (bucket === "high") breakdown.high += 1;
    else if (bucket === "medium") breakdown.medium += 1;
    else breakdown.low += 1;
  }

  const chainSteps = topPath ? pathSteps(topPath) : [];

  return {
    investigationId: detail.summary.id,
    sourceLabel: sourceLabel || meta.sourceFile || report.target?.split(/[/\\]/).pop() || "Evidence",
    executive: {
      risk: (report.attack_surface_classification || meta.risk || "LOW").toUpperCase(),
      assets,
      validatedFindings: stats.findings_retained ?? validated.length,
      attackPaths: detail.summary.path_count,
      blastRadius:
        topPath?.blast_radius ??
        detail.attack_paths.reduce((m, p) => Math.max(m, p.blast_radius), 0),
      analystNote: executiveAnalystNote(bundle, detail.attack_paths.length),
    },
    topPath: chainSteps.length
      ? {
          steps: chainSteps.map((s) => s.toUpperCase()),
          confidence: topPath!.confidence,
          blastRadius: topPath!.blast_radius,
          riskScore: topPath!.risk,
          mitreTags: topPath!.mitre_tactics || [],
          title: topPath!.title,
          analystNote: topPathAnalystNote(topPath, rawRejected.length),
        }
      : null,
    breakdown,
    findings: validated.slice(0, 6).map((f, i) => findingCard(f, i, uploadedFilenames)),
    validatedChains,
    rejectedChains,
    graphAnalystNote: graphAnalystNote(hasPaths, graph.nodes.length, topPath),
    chainsAnalystNote: chainsAnalystNote(validatedChains, rejectedChains),
    graph,
    hasPaths,
    rejectedPathCount: rawRejected.length,
    graphConfidence: hasPaths ? avgConfidence(detail) : null,
  };
}

export function combinedAnalystIntro(fileCount: number): string {
  if (fileCount <= 1) return "Let me walk through what turned up in this scan.";
  return `I pulled ${fileCount} evidence files together — here's how they connect.`;
}

export function separateAnalystIntro(count: number): string {
  return count === 1
    ? "Starting with this environment."
    : `I ran ${count} separate investigations — I'll take them one at a time.`;
}

export function avgBundleConfidence(bundle: InvestigationBundle): number {
  if (bundle.detail.attack_paths.length) return Math.round(avgConfidence(bundle.detail));
  const f = bundle.findings.validated[0];
  return f?.confidence != null ? Math.round(f.confidence) : 0;
}

function assetKeys(bundle: InvestigationBundle): Set<string> {
  const keys = new Set<string>();
  const rows = [...(bundle.report.assets ?? []), ...(bundle.report.discovered_assets ?? [])];
  for (const row of rows) {
    const host = row.host ?? row.ip ?? row.name ?? row.hostname;
    if (typeof host === "string" && host.trim()) {
      keys.add(host.trim().toLowerCase());
    }
  }
  const target = bundle.report.target;
  if (typeof target === "string" && target.trim()) {
    keys.add(target.split(/[/\\]/).pop()!.trim().toLowerCase());
  }
  return keys;
}

export function detectOverlappingAssets(bundles: InvestigationBundle[]): boolean {
  if (bundles.length < 2) return false;
  const seen = new Set<string>();
  for (const bundle of bundles) {
    for (const key of assetKeys(bundle)) {
      if (seen.has(key)) return true;
      seen.add(key);
    }
  }
  return false;
}
