import type { WorkbenchConfirmedFinding, WorkbenchData } from "@/lib/types";
import {
  buildFindingExplainability,
  buildReadableVerdict,
  confidenceContributors,
  evidenceTimelineSteps,
  investigationStorySteps,
  missingEvidenceChecklist,
  recommendationTasks,
  riskOverviewMetrics,
} from "@/lib/workbench-report-helpers";

function lines(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join("\n");
}

export function sectionContextExecutiveSummary(
  workbench: WorkbenchData,
  risk: string,
  confidence: number | null,
): string {
  const v = buildReadableVerdict(workbench, risk, confidence);
  return lines(
    `Status: ${v.statusLabel}`,
    `Headline: ${v.headline}`,
    `Summary: ${v.summary}`,
    v.panel.highestPriorityFinding ? `Top finding: ${v.panel.highestPriorityFinding} (${v.panel.highestPriorityHost})` : null,
    `What VANE knows: ${v.whatWeKnow}`,
    v.stillOpen ? `Still open: ${v.stillOpen}` : null,
    `Why respond: ${v.whyRespond}`,
    `Next action: ${v.nextAction}`,
    v.panel.overallConfidence != null
      ? `${v.panel.confidenceLabel}: ${v.panel.overallConfidence}% — ${v.panel.confidenceMeaning}`
      : null,
    `Attack surface: ${v.panel.riskLevel}`,
  );
}

export function sectionContextInvestigationStory(workbench: WorkbenchData): string {
  return investigationStorySteps(workbench)
    .map((s, i) => `${i + 1}. ${s.label}${s.detail ? ` — ${s.detail}` : ""}`)
    .join("\n");
}

export function sectionContextFinding(finding: WorkbenchConfirmedFinding): string {
  const ex = buildFindingExplainability(finding);
  const { score, contributors } = confidenceContributors(finding);
  return lines(
    `Finding: ${finding.title}`,
    `Host: ${finding.host}`,
    `Severity: ${finding.severity}`,
    `Status: ${finding.status}`,
    `What happened: ${ex.whatHappened}`,
    `Why retained: ${ex.whyBelieve.join("; ")}`,
    `Caveats: ${ex.whatCouldBeWrong.join("; ") || "None listed"}`,
    `Conclusion: ${ex.finalConclusion}`,
    `Confidence: ${score}%`,
    contributors.length
      ? `Contributors: ${contributors.map((c) => `${c.label} (${c.delta >= 0 ? "+" : ""}${c.delta})`).join(", ")}`
      : null,
    ex.confidenceWouldIncrease.length
      ? `Would increase confidence if: ${ex.confidenceWouldIncrease.map((x) => x.item).join("; ")}`
      : null,
  );
}

export function sectionContextFindings(workbench: WorkbenchData): string {
  return workbench.confirmed_findings
    .slice(0, 8)
    .map((f, i) => `[${i + 1}] ${sectionContextFinding(f)}`)
    .join("\n\n");
}

export function sectionContextEvidenceTimeline(workbench: WorkbenchData): string {
  const top = workbench.confirmed_findings[0];
  const steps = top ? evidenceTimelineSteps(workbench, top) : evidenceTimelineSteps(workbench);
  return steps
    .map((s) => `- ${s.label}${s.detail ? `: ${s.detail}` : ""}${s.delta != null ? ` (${s.delta >= 0 ? "+" : ""}${s.delta})` : ""}`)
    .join("\n");
}

export function sectionContextMissingEvidence(workbench: WorkbenchData): string {
  return missingEvidenceChecklist(workbench)
    .map((item) => `- ${item.topic}: ${item.whyItMatters}. ${item.confidenceChange}`)
    .join("\n");
}

export function sectionContextRecommendations(workbench: WorkbenchData): string {
  return recommendationTasks(workbench)
    .map((t, i) => `${i + 1}. ${t.action} → Expected: ${t.expectedResult}`)
    .join("\n");
}

export function sectionContextAtGlance(
  workbench: WorkbenchData,
  risk: string,
  confidence: number | null,
): string {
  return riskOverviewMetrics(workbench, risk, confidence)
    .filter((m) => m.highlight || m.label === "Paths")
    .map((m) => `${m.label}: ${m.value}`)
    .join("\n");
}

export function sectionContextRecommendationTask(
  priority: number,
  action: string,
  expectedResult: string,
  expectedGain?: number | null,
): string {
  return lines(
    `Priority: P${priority}`,
    `Action: ${action}`,
    `Expected result: ${expectedResult}`,
    expectedGain ? `Expected confidence gain: +${expectedGain}%` : null,
  );
}

export function sectionContextAttackGraph(workbench: WorkbenchData): string {
  const paths = workbench.candidate_paths;
  if (!paths.length) return "No attack paths were evaluated.";
  return paths
    .slice(0, 6)
    .map(
      (p) =>
        `- ${p.status}: ${p.steps.join(" → ")} (confidence ${p.confidence}%)${p.reason ? ` — ${p.reason}` : ""}`,
    )
    .join("\n");
}
