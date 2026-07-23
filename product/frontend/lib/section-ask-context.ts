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

export function sectionContextBusinessImpact(workbench: WorkbenchData): string {
  const top = workbench.confirmed_findings[0];
  const impact = top?.business_impact_detail || top?.business_impact;
  if (!impact) {
    return lines(
      `Confirmed findings: ${workbench.confirmed_findings.length}`,
      workbench.executive_summary ? `Summary: ${workbench.executive_summary}` : null,
    );
  }
  if (typeof impact === "string") return impact;
  return lines(
    impact.summary ? `Summary: ${impact.summary}` : null,
    impact.attacker_gains ? `Attacker gains: ${impact.attacker_gains}` : null,
    impact.systems_exposed ? `Systems exposed: ${impact.systems_exposed}` : null,
    impact.process_affected ? `Process affected: ${impact.process_affected}` : null,
    impact.importance ? `Importance: ${impact.importance}` : null,
  );
}

export function sectionContextConfidence(
  workbench: WorkbenchData,
  risk: string,
  confidence: number | null,
): string {
  return lines(
    sectionContextAtGlance(workbench, risk, confidence),
    "",
    sectionContextFindings(workbench),
  );
}

export function sectionContextEvidence(workbench: WorkbenchData): string {
  return lines(
    `Provenance rows: ${workbench.provenance.length}`,
    ...workbench.provenance.slice(0, 8).map((row) => {
      const supports = (row.supports || [])
        .map((s) => `${s.source}: ${s.evidence}`)
        .join("; ");
      return `- ${row.claim}${supports ? ` — ${supports}` : ""}`;
    }),
  );
}

export function sectionContextTimeline(workbench: WorkbenchData): string {
  const steps = workbench.investigation_timeline || workbench.evidence_trail || [];
  if (!steps.length) return sectionContextEvidenceTimeline(workbench);
  return steps
    .slice(0, 12)
    .map((step) => `- ${step.event}${step.detail ? `: ${step.detail}` : ""}`)
    .join("\n");
}

export function sectionContextEvidenceFiles(workbench: WorkbenchData): string {
  return (workbench.file_contributions || [])
    .map(
      (row) =>
        `- ${row.file} (${row.tool}): ${row.findings} findings, ${row.retained} retained, ${row.rejected} rejected`,
    )
    .join("\n");
}

export function sectionContextInvestigationNotes(workbench: WorkbenchData): string {
  const notes = workbench.notes;
  return lines(
    notes?.evidence ? `Evidence: ${notes.evidence}` : null,
    notes?.correlation ? `Correlation: ${notes.correlation}` : null,
    notes?.paths ? `Paths: ${notes.paths}` : null,
    notes?.summary ? `Summary: ${notes.summary}` : null,
    `Pipeline stages: ${workbench.pipeline.length}`,
    `Sources: ${workbench.evidence_sources.map((s) => s.label).join(", ")}`,
  );
}
