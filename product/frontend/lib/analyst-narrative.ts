import type { WorkbenchData } from "@/lib/types";
import {
  CONFIDENCE_METRIC_LABEL,
  displayedConfidenceMetrics,
  missingEvidenceRows,
  normalizeFailureReason,
  semanticConfidence,
  summarizePathFailures,
} from "@/lib/workbench-report-helpers";

export function buildWhySection(wb: WorkbenchData): string {
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

export function buildMissingSection(wb: WorkbenchData): string {
  const rows = missingEvidenceRows(wb);
  if (!rows.length) return "- No high-value missing evidence remaining.";
  return rows
    .map(
      (r) =>
        `- ${r.topic} (+${r.expected_gain || 0}%) — ${r.reason}; need ${r.evidence_needed}`,
    )
    .join("\n");
}

export function buildAnalystNarrative(wb: WorkbenchData): string {
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
    "**What happened**",
    whatHappened,
    "",
    "**Why VANE believes it**",
    why,
    "",
    "**How certain**",
    certainty,
    "",
    "**Missing evidence**",
    buildMissingSection(wb),
    "",
    "**What should happen next**",
    `- ${recommendation}${
      missing[0]?.expected_gain
        ? ` (expected +${missing[0].expected_gain}% confidence)`
        : ""
    }`,
  ].join("\n");
}

export function reconstructRejection(wb: WorkbenchData): string {
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
