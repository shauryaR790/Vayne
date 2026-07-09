import type { InvestigationBundle } from "@/lib/investigation-bundle";
import type { StoredChatMessage } from "@/lib/conversation-session";
import type { WorkbenchConfirmedFinding, WorkbenchData } from "@/lib/types";
import {
  CONFIDENCE_METRIC_LABEL,
  displayedConfidenceMetrics,
  missingEvidenceRows,
  normalizeFailureReason,
  semanticConfidence,
  summarizePathFailures,
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

function reconstructRejection(wb: WorkbenchData): string {
  const rejected = wb.candidate_paths.filter((p) => p.status === "REJECTED");
  if (!rejected.length) {
    return "No candidate paths were rejected in this investigation.";
  }
  const summary = summarizePathFailures(wb.candidate_paths);
  const lines = [
    `${rejected.length} path(s) rejected. Failure reasons:`,
    ...summary.map((r) => `  ${r.count}× ${r.reason}`),
    "",
    "Rejection chain (top failures):",
  ];
  for (const path of rejected.slice(0, 4)) {
    lines.push(
      `  ${path.steps.join(" → ")}`,
      `    failed: ${normalizeFailureReason(path.reason)}`,
      path.missing[0] ? `    missing: ${path.missing[0]}` : "    missing: additional validation evidence",
    );
  }
  return lines.join("\n");
}

function buildWhySection(wb: WorkbenchData): string {
  const top = wb.confirmed_findings[0];
  if (!top) return "No retained finding to anchor belief on.";

  const proof = top.proof?.length
    ? top.proof
    : top.sources.map((s) => ({ source: s, detail: top.evidence[0] || "observation" }));
  const proofLines = proof
    .slice(0, 4)
    .map((p) => `  ${p.source}: ${p.detail}`)
    .join("\n");

  const sem = semanticConfidence(top);
  const metricBits = displayedConfidenceMetrics(top)
    .map(({ label, metric }) => `${label} ${metric.score}%`)
    .join(" · ");

  const parts = [
    `${top.title} on ${top.host || "target"} — ${metricBits || `${top.machine_confidence}%`} (${top.status}).`,
    proofLines ? `Evidence:\n${proofLines}` : null,
  ];

  if (sem?.correlation) {
    parts.push(`Correlation confidence ${sem.correlation.score}% across ${top.sources.join(", ")}.`);
  } else if (wb.totals.cross_source_matches > 0) {
    parts.push(`${wb.totals.cross_source_matches} finding(s) corroborated across scanners.`);
  }

  if (sem?.exploit) {
    parts.push(`Exploit confidence ${sem.exploit.score}% — ${sem.exploit.question}`);
  }

  if (wb.totals.validated_paths > 0) {
    parts.push(`${wb.totals.validated_paths} attack path(s) retained after validation.`);
  } else if (wb.totals.rejected_paths > 0) {
    const topReason = summarizePathFailures(wb.candidate_paths)[0];
    parts.push(
      `${wb.totals.rejected_paths} path(s) rejected` +
        (topReason ? ` — most common: ${topReason.reason}` : "") +
        ".",
    );
  }

  return parts.filter(Boolean).join("\n");
}

function buildMissingSection(wb: WorkbenchData): string {
  const rows = missingEvidenceRows(wb);
  if (!rows.length) return "• No high-value missing evidence remaining.";
  return rows
    .map(
      (r) =>
        `• ${r.topic} (+${r.expected_gain || 0}%) — ${r.reason}; need ${r.evidence_needed}`,
    )
    .join("\n");
}

function buildAnalystNarrative(wb: WorkbenchData): string {
  const top = wb.confirmed_findings[0];
  const missing = missingEvidenceRows(wb);
  const recommendation =
    missing[0]?.topic ||
    wb.next_actions[0] ||
    "Prioritize validation of the highest-confidence exposure before remediation.";

  const whatHappened = wb.executive_summary;
  const why = buildWhySection(wb);
  const sem = top ? semanticConfidence(top) : null;
  const metricLine = top
    ? displayedConfidenceMetrics(top)
        .map(({ label, metric }) => `${label} ${metric.score}%`)
        .join(" · ")
    : "";
  const certainty = top
    ? `${metricLine || `${top.machine_confidence}%`} on ${top.title}` +
      (sem
        ? ` — primary is ${CONFIDENCE_METRIC_LABEL[sem.primary.metric]}. Ask "Why is this ${sem.primary.score}%?" for the factor breakdown.`
        : ".")
    : "No retained finding.";

  return [
    "What happened",
    whatHappened,
    "",
    "Why VANE believes it",
    why,
    "",
    "How certain",
    certainty,
    "",
    "Missing evidence",
    buildMissingSection(wb),
    "",
    "What should happen next",
    recommendation +
      (missing[0]?.expected_gain
        ? ` (expected +${missing[0].expected_gain}% confidence)`
        : ""),
  ].join("\n");
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
      "Missing evidence ranked by expected confidence gain:",
      buildMissingSection(wb),
      "",
      `Next action: ${missingEvidenceRows(wb)[0]?.topic || wb.next_actions[0] || "Validate top exposure."}`,
    ].join("\n");
  }

  if (q.includes("proof") || q.includes("evidence") || q.includes("why believe")) {
    return buildWhySection(wb);
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
  const ts = Date.now();

  bundles.forEach((bundle, index) => {
    const label =
      options?.sourceLabels?.[index] ||
      bundle.report.target?.split(/[/\\]/).pop() ||
      undefined;
    const wb = bundle.workbench;

    if (wb) {
      const prefix = label && bundles.length > 1 ? `[${label}]\n\n` : "";
      messages.push({
        id: `brief-analyst-${bundle.detail.summary.id}`,
        role: "assistant",
        content: `${prefix}${buildAnalystNarrative(wb)}`,
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
      content: `${label ? `[${label}]\n\n` : ""}What happened\n${
        retained
          ? `I retained ${retained} finding${retained === 1 ? "" : "s"} across ${assets} asset${assets === 1 ? "" : "s"}. Risk: ${risk}.`
          : "No findings met the evidence threshold."
      }\n\nWhat should happen next\nRun targeted validation on the highest-severity exposure first.`,
    });
  });

  if (options?.intro?.trim() && messages.length) {
    messages.unshift({
      id: `brief-intro-${ts}`,
      role: "assistant",
      content: options.intro.trim(),
    });
  }

  return messages;
}
