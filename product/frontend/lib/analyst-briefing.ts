import type { InvestigationBundle } from "@/lib/investigation-bundle";
import type { StoredChatMessage } from "@/lib/conversation-session";
import { buildBriefingSegments, flattenSegmentText } from "@/lib/analyst-segments";
import { buildEngineFileInsights } from "@/lib/engine-file-insights";
import {
  buildAnalystNarrative,
  buildMissingSection,
  buildWhySection,
  reconstructRejection,
} from "@/lib/analyst-narrative";
import type { WorkbenchConfirmedFinding, WorkbenchData } from "@/lib/types";
import {
  CONFIDENCE_METRIC_LABEL,
  displayedConfidenceMetrics,
  missingEvidenceRows,
  semanticConfidence,
} from "@/lib/workbench-report-helpers";

function reconstructConfidence(finding: WorkbenchConfirmedFinding): string {
  const metrics = displayedConfidenceMetrics(finding);
  if (!metrics.length) {
    return `${finding.title} has no analytically meaningful confidence percentage.`;
  }

  const blocks: string[] = [];
  for (const { key, label, metric } of metrics) {
    const lines = metric.factors.map(
      (f) => `  ${f.label.padEnd(32)} ${f.delta >= 0 ? `+${f.delta}` : f.delta}`,
    );
    blocks.push(
      [
        `${label} confidence for ${finding.title}: ${metric.score}%`,
        metric.question,
        "",
        "Built from",
        ...lines,
        `  ${"Total".padEnd(32)} ${metric.score}%`,
      ].join("\n"),
    );
  }

  const sem = semanticConfidence(finding);
  const primaryNote = sem
    ? `\nPrimary decision metric: ${CONFIDENCE_METRIC_LABEL[sem.primary.metric]} (${sem.primary.score}%).`
    : "";

  return blocks.join("\n\n") + primaryNote;
}

/**
 * Interpretive analyst reply for follow-up questions.
 * Reconstructs confidence math and rejection chains from workbench facts.
 */
export function interpretAnalystQuestion(
  question: string,
  wb: WorkbenchData | null | undefined,
): string | null {
  if (!wb) return null;
  const q = question.toLowerCase();

  if (
    q.includes("why is this") ||
    q.includes("why is it") ||
    (q.includes("confidence") && (q.includes("why") || q.includes("%") || q.includes("how")))
  ) {
    const pct = q.match(/(\d+)\s*%/);
    const top =
      (pct
        ? wb.confirmed_findings.find((f) => f.machine_confidence === Number(pct[1]))
        : null) || wb.confirmed_findings[0];
    if (!top) return "No retained finding to explain confidence for.";
    return reconstructConfidence(top);
  }

  if (
    q.includes("reject") ||
    q.includes("path fail") ||
    q.includes("why did this path") ||
    q.includes("failed path")
  ) {
    return reconstructRejection(wb);
  }

  if (q.includes("missing") || q.includes("what next") || q.includes("next step")) {
    return [
      "**Missing evidence**",
      buildMissingSection(wb),
      "",
      "**Next action**",
      `- ${missingEvidenceRows(wb)[0]?.topic || wb.next_actions[0] || "Validate top exposure."}`,
    ].join("\n");
  }

  if (q.includes("proof") || q.includes("evidence") || q.includes("why believe")) {
    return ["**Why VANE believes it**", buildWhySection(wb)].join("\n\n");
  }

  return null;
}

/**
 * Analyst chat briefing — interprets the investigation, does not narrate the report.
 */
export function buildAnalystBriefingMessages(
  bundles: InvestigationBundle[],
  options?: {
    intro?: string;
    sourceLabels?: string[];
  },
): StoredChatMessage[] {
  const messages: StoredChatMessage[] = [];

  bundles.forEach((bundle, index) => {
    const label =
      options?.sourceLabels?.[index] ||
      bundle.report.target?.split(/[/\\]/).pop() ||
      undefined;
    const wb = bundle.workbench;

    if (wb) {
      const prefix = label && bundles.length > 1 ? `[${label}]` : "";
      const narrative = buildAnalystNarrative(wb);
      const fileInsights = buildEngineFileInsights(wb, {
        bundle,
        sourceLabel: label,
        sourceLabels: options?.sourceLabels,
      });
      const streamSegments = buildBriefingSegments(wb, fileInsights, {
        intro: options?.intro,
        prefix: prefix || undefined,
        narrative,
      });
      messages.push({
        id: `brief-analyst-${bundle.detail.summary.id}`,
        role: "assistant",
        content: flattenSegmentText(streamSegments),
        fileInsights,
        streamSegments,
      });
      return;
    }

    const retained = bundle.findings.validated.length;
    const assets =
      bundle.report.assets?.length || bundle.report.discovered_assets?.length || 1;
    const risk = (bundle.report.attack_surface_classification || "unknown").toUpperCase();
    messages.push({
      id: `brief-fallback-${bundle.detail.summary.id}`,
      role: "assistant",
      content: `${label ? `[${label}]\n\n` : ""}**What happened**\n${
        retained
          ? `1. Retained ${retained} finding${retained === 1 ? "" : "s"} across ${assets} asset${assets === 1 ? "" : "s"}.\n2. Attack surface risk: ${risk}.`
          : "1. No findings met the evidence threshold."
      }\n\n**What should happen next**\n- Run targeted validation on the highest-severity exposure first.`,
    });
  });

  return messages;
}
