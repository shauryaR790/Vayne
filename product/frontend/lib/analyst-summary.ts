import type { InvestigationBundle } from "./investigation-bundle";
import {
  avgConfidence,
  avgRisk,
  countServices,
  countSoftware,
  parseRejectedChains,
  topRejectionReasons,
} from "./report-helpers";

export interface AnalystBriefing {
  summaryText: string;
  overallRisk: string;
  confidence: number | null;
  primaryFinding: string;
  recommendedAction: string;
  attackNarrative: string[];
  safeEnvironment: boolean;
}

export function buildAnalystBriefing(bundle: InvestigationBundle): AnalystBriefing {
  const { detail, report, findings } = bundle;
  const stats = report.stats;
  const hasPaths = detail.attack_paths.length > 0;
  const assets = report.assets?.length ?? 0;
  const services = countServices(report);
  const pathsExplored = stats.paths_explored ?? stats.attack_paths + (stats.paths_rejected ?? 0);
  const validatedFindings = stats.findings_retained;
  const topFinding = findings.validated[0];

  const confidence = hasPaths
    ? avgConfidence(detail)
    : topFinding?.confidence != null
      ? Math.round(topFinding.confidence)
      : null;

  const overallRisk = normalizeRisk(report.attack_surface_classification, hasPaths);
  const primaryFinding = hasPaths
    ? detail.attack_paths[0]?.title?.split(/\s*→\s*/)[0]?.trim() ||
      topFinding?.title ||
      "Validated Exploitation Chain"
    : topFinding?.title || "No Exploitable Path Found";

  const recommendedAction = deriveRecommendedAction(overallRisk, hasPaths, stats);
  const attackNarrative = deriveAttackNarrative(bundle, hasPaths);
  const safeEnvironment = !hasPaths && stats.confirmed === 0 && stats.likely_exploitable === 0;

  let summaryText: string;
  if (hasPaths) {
    summaryText = `The engine analyzed ${assets || 1} asset${assets === 1 ? "" : "s"}, retained ${validatedFindings} finding${validatedFindings === 1 ? "" : "s"}, explored ${pathsExplored || detail.summary.path_count} attack path${pathsExplored === 1 ? "" : "s"}, and validated ${detail.summary.path_count} exploitation chain${detail.summary.path_count === 1 ? "" : "s"}.`;
  } else if (validatedFindings > 0) {
    summaryText = `Evidence was reviewed across ${assets || 1} asset${assets === 1 ? "" : "s"} and ${services} service${services === 1 ? "" : "s"}. ${validatedFindings} observation${validatedFindings === 1 ? "" : "s"} ${validatedFindings === 1 ? "was" : "were"} retained, but no validated exploit chain could be constructed.`;
  } else {
    summaryText =
      "The investigation did not identify any validated attack chains. Several low-confidence observations may exist, but none met the evidence threshold required for exploitation validation.";
  }

  return {
    summaryText,
    overallRisk,
    confidence,
    primaryFinding,
    recommendedAction,
    attackNarrative,
    safeEnvironment,
  };
}

function normalizeRisk(classification: string, hasPaths: boolean): string {
  const c = classification.toLowerCase();
  if (c.includes("critical")) return "Critical";
  if (c.includes("high")) return "High";
  if (hasPaths) return "High";
  if (c.includes("medium") || c.includes("moderate")) return "Medium";
  if (c.includes("low")) return "Low";
  if (c.includes("info")) return "Informational";
  return hasPaths ? "High" : "Low";
}

function deriveRecommendedAction(
  risk: string,
  hasPaths: boolean,
  stats: InvestigationBundle["report"]["stats"],
): string {
  if (!hasPaths && stats.confirmed === 0 && stats.likely_exploitable === 0) {
    return "No action required";
  }
  if (risk === "Critical" || risk === "High") return "Immediate patching required";
  if (risk === "Medium") return "Network isolation recommended";
  if (hasPaths) return "Immediate patching required";
  return "Monitor only";
}

function deriveAttackNarrative(bundle: InvestigationBundle, hasPaths: boolean): string[] {
  const { detail } = bundle;
  if (hasPaths && detail.attack_paths[0]?.title) {
    const steps = detail.attack_paths[0].title
      .split(/\s*→\s*|\s*>\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (steps.length) return steps;
  }

  const chains = parseRejectedChains(bundle.report);
  if (chains[0]?.steps.length) {
    return chains[0].steps.map(formatNarrativeStep);
  }

  return hasPaths
    ? ["Internet", "Asset", "Service", "Exploit", "Credential Access", "Privilege Escalation"]
    : ["Internet", "Asset", "Service", "Vulnerability", "Exploit"];
}

function formatNarrativeStep(step: string): string {
  const s = step.toLowerCase();
  if (s.includes("internet") || s.includes("endpoint")) return "Internet";
  if (s.includes("asset") || s.includes("host")) return "Asset";
  if (s.includes("service") || s.includes("port")) return "Service";
  if (s.includes("software") || s.includes("apache") || s.includes("http")) return "Vulnerable Service";
  if (s.includes("cve") || s.includes("vuln")) return "Vulnerability";
  if (s.includes("exploit")) return "Exploit";
  if (s.includes("cred")) return "Credential Access";
  if (s.includes("priv")) return "Privilege Escalation";
  return step.charAt(0).toUpperCase() + step.slice(1);
}

export function buildOpeningAnalystMessage(briefing: AnalystBriefing): string {
  if (briefing.safeEnvironment) {
    return "This investigation did not identify any validated attack chains. While several services and software components may have been discovered, none met the evidence threshold required to establish a credible exploitation path. From a defensive perspective, this is a positive outcome.\n\nOverall Risk: Low\nRecommended Action: Continue routine monitoring\n\nAsk about what the engine examined, rejected paths, or specific observations.";
  }

  const narrative =
    briefing.attackNarrative.length > 0
      ? briefing.attackNarrative.join(" → ")
      : "—";

  return [
    briefing.summaryText,
    "",
    `Overall Risk: ${briefing.overallRisk}`,
    briefing.confidence != null ? `Confidence: ${briefing.confidence}%` : null,
    `Primary Finding: ${briefing.primaryFinding}`,
    `Recommended Action: ${briefing.recommendedAction}`,
    "",
    `Attack Narrative: ${narrative}`,
    "",
    "Ask about the chain, evidence, remediation, or business impact.",
  ]
    .filter((line): line is string => line != null)
    .join("\n");
}

export function respondToQuestion(
  question: string,
  bundle: InvestigationBundle,
  briefing: AnalystBriefing,
): string {
  const q = question.toLowerCase();
  const { detail, report, findings } = bundle;
  const stats = report.stats;
  const hasPaths = detail.attack_paths.length > 0;
  const reasons = topRejectionReasons(report);

  if (q.includes("ceo") || q.includes("executive")) {
    return hasPaths
      ? `Executive summary: VAYNE identified ${detail.summary.path_count} validated attack path${detail.summary.path_count === 1 ? "" : "s"} with ${briefing.overallRisk.toLowerCase()} overall risk. ${briefing.primaryFinding} represents the most immediate concern. ${briefing.recommendedAction}.`
      : "Executive summary: No validated compromise path was identified. The attack surface shows observations but no confirmed exploitation chain. Continue monitoring and address low-confidence findings during scheduled maintenance.";
  }

  if (q.includes("soc") || q.includes("analyst")) {
    return hasPaths
      ? `SOC briefing: ${stats.findings_retained} retained findings, ${detail.summary.path_count} verified paths, avg confidence ${avgConfidence(detail)}%. MITRE tactics observed: ${detail.attack_paths[0]?.mitre_tactics?.join(", ") || "initial access, execution"}. Prioritize ${briefing.primaryFinding}.`
      : `SOC briefing: Discovery and fingerprinting completed. ${stats.observed} observed findings, ${stats.paths_rejected ?? parseRejectedChains(report).length} paths rejected. Top rejection: ${reasons[0] || "insufficient exploit confidence"}. No validated IOC chain.`;
  }

  if (q.includes("pentest") || q.includes("penetration")) {
    return hasPaths
      ? `Penetration tester view: Validated chain — ${briefing.attackNarrative.join(" → ")}. Blast radius ${detail.attack_paths[0]?.blast_radius ?? "unknown"}. Risk score ${avgRisk(detail).toFixed(1)}. Re-test after remediation.`
      : `Penetration tester view: Attack surface mapped but no chain met validation threshold. Candidate paths were pruned — ${reasons.slice(0, 2).join("; ") || "confidence below threshold"}. Worth manual verification of ${findings.validated[0]?.title || "observed services"}.`;
  }

  if (q.includes("reject")) {
    const chains = parseRejectedChains(report);
    if (!chains.length) return "No rejected paths were recorded in this investigation bundle.";
    return chains
      .slice(0, 3)
      .map((c) => `${c.steps.join(" → ")} — rejected: ${c.reason}`)
      .join("\n\n");
  }

  if (q.includes("serious") || q.includes("how bad")) {
    return `Overall risk: ${briefing.overallRisk}.${briefing.confidence != null ? ` Confidence: ${briefing.confidence}%.` : ""} ${briefing.recommendedAction}. ${hasPaths ? "This finding warrants immediate attention." : "No validated exploitation — severity is contained to observations."}`;
  }

  if (q.includes("domain") || q.includes("compromise")) {
    return hasPaths
      ? `Based on validated paths, lateral movement potential exists. Blast radius ${detail.attack_paths[0]?.blast_radius ?? "moderate"}. Domain compromise depends on credential access stages — review attack chain for privilege escalation evidence.`
      : "No validated path reaches credential access or domain controller stages. Domain compromise is unlikely based on current evidence.";
  }

  if (q.includes("mitigation") || q.includes("remediation") || q.includes("what should")) {
    return `${briefing.recommendedAction}. Address ${briefing.primaryFinding} first. ${countSoftware(report)} software components fingerprinted — patch or isolate exposed services.`;
  }

  if (q.includes("attack path") || q.includes("attack chain")) {
    return hasPaths
      ? `Validated chain: ${briefing.attackNarrative.join(" → ")}. Confidence ${briefing.confidence}%. ${detail.attack_paths[0]?.title || ""}`
      : `No validated attack path. Narrative terminated at: ${briefing.attackNarrative.join(" → ")}. ${reasons[0] ? `Reason: ${reasons[0]}` : "Insufficient evidence for exploit verification."}`;
  }

  if (q.includes("technical")) {
    return `${stats.findings_loaded} findings loaded, ${stats.findings_retained} retained, ${stats.attack_paths} paths verified, ${stats.paths_rejected ?? 0} rejected. Analysis duration ${report.duration_seconds.toFixed(1)}s. Attack surface score ${report.attack_surface_score}/100.`;
  }

  if (q.includes("investigation") || q.includes("explain")) {
    return briefing.summaryText;
  }

  if (briefing.safeEnvironment) {
    return "I found no evidence of a validated attack path. The environment appears normal based on the provided evidence.";
  }

  return `Regarding "${question}": ${briefing.summaryText} Ask about attack paths, rejections, remediation, or request an executive summary for more detail.`;
}
