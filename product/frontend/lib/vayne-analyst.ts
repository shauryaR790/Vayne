import type { InvestigationBundle } from "./investigation-bundle";
import {
  buildAnalystBriefing,
  buildOpeningAnalystMessage as buildBriefingOpeningMessage,
  type AnalystBriefing,
} from "./analyst-summary";
import {
  avgConfidence,
  avgRisk,
  countServices,
  parseRejectedChains,
  topRejectionReasons,
} from "./report-helpers";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface AnalystContext {
  briefing: AnalystBriefing;
  bundle: InvestigationBundle;
  history: ChatTurn[];
}

type Intent =
  | "greeting"
  | "executive"
  | "technical"
  | "remediation"
  | "attack_path"
  | "rejections"
  | "severity"
  | "domain"
  | "fix"
  | "report"
  | "followup_fix"
  | "casual"
  | "graph"
  | "time_saved"
  | "ciso"
  | "soc"
  | "business"
  | "junior"
  | "unknown";

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shortFinding(title: string, max = 80): string {
  const t = title.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function lastUserTopic(history: ChatTurn[]): string | null {
  for (let i = history.length - 2; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "user") continue;
    const q = m.content.toLowerCase();
    if (/risk|serious|bad|worst|biggest/.test(q)) return "risk";
    if (/fix|remediat|mitigat|patch|how do i/.test(q)) return "fix";
    if (/attack|chain|path|exploit/.test(q)) return "attack";
    if (/reject/.test(q)) return "reject";
  }
  return null;
}

function classifyIntent(question: string, history: ChatTurn[]): Intent {
  const q = question.toLowerCase().trim();
  const prev = lastUserTopic(history);

  if (/^(hi|hello|hey|yo|sup)\b/.test(q)) return "greeting";
  if (/^(thanks|thank you|ok|okay|cool)\b/.test(q)) return "casual";
  if (/^why\b|why was|why did|why not/.test(q)) return prev === "fix" ? "followup_fix" : "rejections";

  if (/how (do i|to) fix|how can i fix|remediat|mitigat|patch|what should i do|remediation plan/.test(q)) {
    return prev === "risk" ? "followup_fix" : "remediation";
  }
  if (/biggest risk|most serious|worst|how bad|how serious/.test(q)) return "severity";
  if (/executive|ceo|management|board|leadership/.test(q)) return "executive";
  if (/ciso|chief information/.test(q)) return "ciso";
  if (/soc team|soc action|what should my soc|monitor/.test(q)) return "soc";
  if (/business impact|business risk/.test(q)) return "business";
  if (/time saved|analyst time|how much time/.test(q)) return "time_saved";
  if (/explain the graph|attack graph|what does the graph/.test(q)) return "graph";
  if (/junior|new to security|eli5|explain like i/.test(q)) return "junior";
  if (/technical|pentest|penetration/.test(q)) return "technical";
  if (/reject|why not|failed path|didn't validate/.test(q)) return "rejections";
  if (/attack path|attack chain|exploit chain|how did they|what would an attacker/.test(q)) return "attack_path";
  if (/domain|lateral|compromise|dc\b|controller/.test(q)) return "domain";
  if (/report|export|document/.test(q)) return "report";
  if (/what happened|explain|investigation|summary|what did you find/.test(q)) return "technical";
  if (prev === "risk" && /fix|that|it|this/.test(q)) return "followup_fix";

  return "unknown";
}

function confidencePhrase(confidence: number | null, hasPaths: boolean): string {
  if (confidence == null) return "I have limited confidence without a validated chain.";
  if (confidence >= 85) return `I'm ${confidence}% confident in this assessment — supporting evidence is strong.`;
  if (confidence >= 60) return `I have moderate confidence (${confidence}%). Some evidence gaps remain.`;
  return `Confidence is ${confidence}% — the available evidence is inconclusive in places.`;
}

function openingMessage(ctx: AnalystContext): string {
  const { briefing, bundle } = ctx;
  const { detail } = bundle;
  const hasPaths = detail.attack_paths.length > 0;

  if (briefing.safeEnvironment) {
    return pick([
      "The engine finished reviewing your evidence. No validated attack chain was found — the environment appears stable based on what was supplied. Ask about rejected candidates or what was examined.",
      "Investigation complete. No exploitation chain met the validation threshold. I can walk through observations or explain why certain paths did not validate.",
    ]);
  }

  if (hasPaths) {
    return pick([
      `The investigation validated ${detail.summary.path_count} attack path${detail.summary.path_count === 1 ? "" : "s"}. Ask about the chain, evidence, remediation, or business impact.`,
      "Analysis is complete — a verified path warrants attention. I can explain how an attacker would move through the environment, or what to fix first.",
      "The engine identified a validated exploitation chain. Ask me to walk through it, explain rejections, or outline remediation.",
    ]);
  }

  return pick([
    "The engine mapped findings but no chain reached exploit validation. Ask about specific observations or rejected candidate chains.",
    "Analysis complete — observations were retained, but no exploitation path validated. Ask about findings or why candidates were rejected.",
  ]);
}

function remediationReply(ctx: AnalystContext, followup: boolean): string {
  const { briefing, bundle } = ctx;
  const finding = shortFinding(briefing.primaryFinding);
  const steps: string[] = [];

  const f = finding.toLowerCase();
  if (f.includes("smb") || f.includes("ms17")) {
    steps.push("Disable SMBv1 on affected hosts immediately.");
    steps.push("Apply MS17-010 patches to vulnerable systems.");
    steps.push("Restrict lateral movement — segment critical infrastructure.");
    steps.push("Rotate privileged credentials if exposure was external.");
    steps.push("Verify no successful exploitation in host logs.");
  } else if (f.includes("apache") || f.includes("httpd") || f.includes("cve")) {
    steps.push(`Patch or upgrade the affected service (${shortFinding(finding, 50)}).`);
    steps.push("Remove path traversal / misconfiguration if present.");
    steps.push("Restrict external access to the service where possible.");
    steps.push("Review web server logs for exploitation attempts.");
    steps.push("Re-scan after patching to confirm closure.");
  } else {
    steps.push(`Address ${shortFinding(finding, 60)} as the first priority.`);
    steps.push("Patch or isolate exposed services identified in the graph.");
    steps.push("Review authentication and network segmentation.");
    steps.push("Monitor for follow-on activity after remediation.");
  }

  const intro = followup
    ? pick([
        "Building on what we discussed — here's how I'd tackle remediation:",
        "For that finding specifically, I'd prioritize:",
        "Here's the order I'd recommend:",
      ])
    : pick([
        "I'd prioritize remediation in this order:",
        "Based on the validated evidence, here's what I'd do first:",
        "My recommendation — tackle these in sequence:",
      ]);

  const conf = confidencePhrase(briefing.confidence, bundle.detail.attack_paths.length > 0);
  return `${intro}\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n${conf}`;
}

function severityReply(ctx: AnalystContext): string {
  const { briefing, bundle } = ctx;
  const hasPaths = bundle.detail.attack_paths.length > 0;
  const finding = shortFinding(briefing.primaryFinding);

  const observation = hasPaths
    ? `The highest concern is ${finding}. Overall risk is ${briefing.overallRisk}.`
    : `No validated exploitation chain, but ${finding} remains the top observation.`;

  const reasoning = hasPaths
    ? pick([
        "My analysis indicates this is exploitable with the evidence we validated — not just theoretical.",
        "The evidence suggests an external actor could progress beyond initial access.",
        "After evaluating attack paths, this stood out for blast radius and exploit confidence.",
      ])
    : pick([
        "Several paths were explored but none met validation — severity is contained to observations.",
        "The available evidence is inconclusive for confirmed compromise.",
      ]);

  const conf = confidencePhrase(briefing.confidence, hasPaths);
  const rec = briefing.recommendedAction;

  return `${observation}\n\n${reasoning}\n\n${conf}\n\nRecommendation: ${rec}.`;
}

function executiveReply(ctx: AnalystContext): string {
  const { briefing, bundle } = ctx;
  const hasPaths = bundle.detail.attack_paths.length > 0;

  if (!hasPaths) {
    return pick([
      "For leadership: we identified observations but no confirmed attack path. The environment appears stable based on supplied evidence. Continue routine monitoring.",
      "Executive view — no validated compromise chain. Risk is informational until further evidence surfaces. Schedule maintenance for low-confidence items.",
    ]);
  }

  return pick([
    `For management: we identified a vulnerability that could allow movement from an exposed system into internal infrastructure. ${briefing.recommendedAction}. Primary concern: ${shortFinding(briefing.primaryFinding, 60)}.`,
    `Executive summary: ${briefing.overallRisk} risk with a validated exploitation path. Immediate remediation is recommended before this is actively exploited.`,
  ]);
}

function technicalReply(ctx: AnalystContext): string {
  const { bundle, briefing } = ctx;
  const { detail, report } = bundle;
  const stats = report.stats;
  const hasPaths = detail.attack_paths.length > 0;
  const assets = report.assets?.length ?? 0;
  const services = countServices(report);

  const observation = hasPaths
    ? `Investigation identified ${assets} asset${assets === 1 ? "" : "s"}, ${services} service${services === 1 ? "" : "s"}, ${stats.findings_retained} retained findings, and ${detail.summary.path_count} verified path${detail.summary.path_count === 1 ? "" : "s"}.`
    : `Mapped ${assets} asset${assets === 1 ? "" : "s"}, ${stats.findings_retained} findings retained — no path validated.`;

  const reasoning = hasPaths
    ? `Chain confidence is ${briefing.confidence ?? avgConfidence(detail)}% with risk score ${avgRisk(detail).toFixed(1)}. MITRE: ${detail.attack_paths[0]?.mitre_tactics?.slice(0, 3).join(", ") || "initial access"}.`
    : `Top rejection: ${topRejectionReasons(report)[0] || "insufficient exploit confidence"}.`;

  return `${observation}\n\n${reasoning}\n\n${confidencePhrase(briefing.confidence, hasPaths)}`;
}

function attackPathReply(ctx: AnalystContext): string {
  const { briefing, bundle } = ctx;
  const hasPaths = bundle.detail.attack_paths.length > 0;

  if (!hasPaths) {
    const reasons = topRejectionReasons(bundle.report);
    return pick([
      `I cannot verify a complete exploitation chain. The narrative stopped at ${briefing.attackNarrative.join(" → ")}.${reasons[0] ? ` Primary reason: ${reasons[0]}.` : ""}`,
      "No validated path — candidate chains were pruned during validation. I can detail rejections if you'd like.",
    ]);
  }

  const chain = briefing.attackNarrative.join(" → ");
  return pick([
    `The validated chain runs: ${chain}. ${briefing.confidence != null ? `Confidence: ${briefing.confidence}%.` : ""} ${bundle.detail.attack_paths[0]?.title ? `Detail: ${shortFinding(bundle.detail.attack_paths[0].title, 100)}` : ""}`,
    `After evaluating paths, this sequence held up: ${chain}. Supporting evidence met our validation bar.`,
  ]);
}

function rejectionsReply(ctx: AnalystContext): string {
  const chains = parseRejectedChains(ctx.bundle.report);
  if (!chains.length) {
    return "No rejected paths were recorded in this bundle — either exploration was limited or all candidates were filtered early.";
  }

  const lines = chains.slice(0, 3).map((c, i) => {
    const path = c.steps.join(" → ");
    return `${i + 1}. ${path}\n   Reason: ${c.reason}`;
  });

  return pick([
    "Several candidate chains didn't survive validation:\n\n",
    "Here's why paths were rejected:\n\n",
  ]) + lines.join("\n\n");
}

function domainReply(ctx: AnalystContext): string {
  const hasPaths = ctx.bundle.detail.attack_paths.length > 0;
  if (!hasPaths) {
    return "Based on current evidence, the engine did not validate a path to domain compromise. No credential access or DC-stage validation occurred.";
  }
  const blast = ctx.bundle.detail.attack_paths[0]?.blast_radius ?? "moderate";
  return pick([
    `Lateral movement potential exists — blast radius ${blast}. Domain compromise depends on whether credential access stages validate; review the chain for privilege escalation evidence.`,
    "The validated chain includes stages that could enable lateral movement. Treat domain impact as plausible until credential paths are remediated.",
  ]);
}

function graphReply(ctx: AnalystContext): string {
  const { graph } = ctx.bundle;
  const nodes = graph.nodes?.length ?? 0;
  const edges = graph.edges?.length ?? 0;
  const stats = graph.statistics ?? {};
  return pick([
    `The attack graph contains ${nodes} nodes and ${edges} edges. It maps how the engine connected assets, services, and exploit stages from source evidence. ${Object.keys(stats).length ? `Statistics: ${JSON.stringify(stats)}.` : ""} Focus on nodes linking external exposure to validated paths.`,
    `After reviewing the graph structure: ${nodes} nodes trace discovery → fingerprinting → vulnerability mapping → validation. Edges show evidence-backed transitions the engine accepted or rejected.`,
  ]);
}

function timeSavedReply(ctx: AnalystContext): string {
  const duration = ctx.bundle.report.duration_seconds;
  const manual = Math.max(4, Math.round(duration / 60 + 3));
  return pick([
    `The engine completed this investigation in ${duration.toFixed(1)} seconds. A manual analyst would typically spend ${manual}+ hours correlating scans, mapping paths, and validating evidence at this depth.`,
    `Automated analysis ran in ${duration.toFixed(1)}s. Equivalent manual work — triage, path exploration, confidence scoring — commonly takes half a day or more for comparable scope.`,
  ]);
}

function cisoReply(ctx: AnalystContext): string {
  return executiveReply(ctx);
}

function socReply(ctx: AnalystContext): string {
  const { briefing, bundle } = ctx;
  const hasPaths = bundle.detail.attack_paths.length > 0;
  if (!hasPaths) {
    return "SOC focus: monitor retained observations, verify no anomalous auth or lateral movement, and ensure rejected-path indicators (failed exploit attempts) are logged. No validated chain — prioritize hygiene on exposed services.";
  }
  return `SOC priorities: alert on ${shortFinding(briefing.primaryFinding, 60)}, monitor SMB/remote access and auth logs on affected hosts, hunt for post-exploitation activity along: ${briefing.attackNarrative.join(" → ")}. ${briefing.recommendedAction}.`;
}

function businessReply(ctx: AnalystContext): string {
  const { briefing, bundle } = ctx;
  const hasPaths = bundle.detail.attack_paths.length > 0;
  if (!hasPaths) {
    return "Impact is limited — no validated exploitation path. Residual risk is operational (unpatched observations) rather than confirmed breach exposure.";
  }
  return pick([
    `If exploited, ${shortFinding(briefing.primaryFinding, 60)} could enable movement into internal infrastructure. Blast radius and data exposure depend on what the validated chain reaches — ${briefing.overallRisk} overall risk. ${briefing.recommendedAction}.`,
    `Impact: validated path from external exposure toward internal assets. ${briefing.recommendedAction} before active exploitation.`,
  ]);
}

function juniorReply(ctx: AnalystContext): string {
  const { briefing, bundle } = ctx;
  const hasPaths = bundle.detail.attack_paths.length > 0;
  if (!hasPaths) {
    return "Simple version: the security engine looked at your scan files and could not prove a realistic hack path. That usually means nothing critical was confirmed — still worth fixing low-hanging issues.";
  }
  return `Simple version: an attacker could follow this path: ${briefing.attackNarrative.join(" → ")}. The main problem is ${shortFinding(briefing.primaryFinding, 50)}. Fix that first.`;
}

function unknownReply(ctx: AnalystContext, question: string): string {
  const { briefing, history } = ctx;
  const alreadySummarized = history.filter((m) => m.role === "assistant").length > 1;

  if (alreadySummarized) {
    return pick([
      `On "${question}" — I'd focus on ${shortFinding(briefing.primaryFinding, 70)}. Want remediation steps, the attack chain, or an executive brief?`,
      "I may not have a precise answer to that phrasing. Try asking about risk, remediation, the attack path, or rejected chains.",
      `The evidence points most strongly to ${shortFinding(briefing.primaryFinding, 60)}. I can go deeper on any of those angles.`,
    ]);
  }

  return openingMessage(ctx);
}

export function generateAnalystReply(
  question: string,
  bundle: InvestigationBundle,
  history: ChatTurn[],
): string {
  const ctx: AnalystContext = {
    briefing: buildAnalystBriefing(bundle),
    bundle,
    history,
  };

  const intent = classifyIntent(question, [...history, { role: "user", content: question }]);

  switch (intent) {
    case "greeting":
      return openingMessage(ctx);
    case "executive":
      return executiveReply(ctx);
    case "technical":
      return technicalReply(ctx);
    case "remediation":
    case "fix":
    case "followup_fix":
      return remediationReply(ctx, intent === "followup_fix");
    case "severity":
      return severityReply(ctx);
    case "attack_path":
      return attackPathReply(ctx);
    case "rejections":
      return rejectionsReply(ctx);
    case "domain":
      return domainReply(ctx);
    case "graph":
      return graphReply(ctx);
    case "time_saved":
      return timeSavedReply(ctx);
    case "ciso":
      return cisoReply(ctx);
    case "soc":
      return socReply(ctx);
    case "business":
      return businessReply(ctx);
    case "junior":
      return juniorReply(ctx);
    case "report":
      return "I can structure an executive report from this investigation — export is coming soon. For now, ask for an executive summary or technical summary and I'll draft the narrative.";
    case "casual":
      return pick([
        "Anytime. What would you like to dig into — risk, remediation, or the attack chain?",
        "Happy to help. Ask about findings, paths, or what to fix first.",
      ]);
    default:
      return unknownReply(ctx, question);
  }
}

export function buildOpeningAnalystMessage(bundle: InvestigationBundle): string {
  return buildBriefingOpeningMessage(buildAnalystBriefing(bundle));
}

export function analystThinkDelay(): number {
  return 300 + Math.floor(Math.random() * 900);
}

export function analystStreamDelay(): number {
  return 10 + Math.floor(Math.random() * 14);
}
