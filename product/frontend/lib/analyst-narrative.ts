import type { WorkbenchData, WorkbenchPriorityItem } from "@/lib/types";
import {
  CONFIDENCE_METRIC_LABEL,
  displayedConfidenceMetrics,
  missingEvidenceRows,
  normalizeFailureReason,
  semanticConfidence,
  summarizePathFailures,
} from "@/lib/workbench-report-helpers";

function topInvestigation(wb: WorkbenchData): WorkbenchPriorityItem | undefined {
  return wb.investigations?.[0] ?? wb.priority_queue?.[0];
}

function humanConfidenceLabel(score: number): string {
  if (score >= 85) return "We are fairly confident";
  if (score >= 70) return "We are moderately confident";
  if (score >= 50) return "We are cautiously confident";
  return "We are not very confident yet";
}

export function buildPlainTermsSection(wb: WorkbenchData): string {
  const inv = topInvestigation(wb);
  if (inv?.reason?.trim()) {
    const action = inv.immediate_action?.trim();
    const impact = inv.business_impact?.trim();
    const parts = [inv.reason.trim()];
    if (impact && !impact.toLowerCase().includes("unknown until")) {
      parts.push(impact);
    }
    if (action) {
      parts.push(`Recommended next move: ${action}`);
    }
    return parts.join(" ");
  }

  const top = wb.confirmed_findings[0];
  if (!top) {
    return "The scan finished, but nothing met the bar for a confirmed security problem. That usually means either a clean surface or findings that still need manual validation.";
  }

  const title = inv?.title || top.title;
  const host = top.host;
  const claim = top.claim_status || "needs_validation";
  const confirmed = claim === "confirmed";
  const suspected = claim === "suspected" || claim === "observed";

  let lead = host
    ? `The scan flagged **${title}** on \`${host}\`.`
    : `The scan flagged **${title}**.`;

  if (confirmed) {
    lead += " Evidence suggests this is a real issue — not just noise.";
  } else if (suspected) {
    lead += " Scanners agree something is exposed, but exploitation has not been proven yet.";
  } else {
    lead += " Treat this as something worth checking — not as proof of a breach.";
  }

  if (wb.totals.validated_paths > 0) {
    lead += ` There ${wb.totals.validated_paths === 1 ? "is" : "are"} ${wb.totals.validated_paths} validated attack path${wb.totals.validated_paths === 1 ? "" : "s"} connecting the dots.`;
  }

  return lead;
}

export function buildWhySection(wb: WorkbenchData): string {
  const inv = topInvestigation(wb);
  if (inv?.priority_reasons?.length) {
    return inv.priority_reasons.map((r) => `- ${r}`).join("\n");
  }

  const top = wb.confirmed_findings[0];
  if (!top) return "- No retained finding to anchor belief on.";

  const proof = top.proof?.length
    ? top.proof
    : top.sources.map((s) => ({ source: s, detail: top.evidence[0] || "observation" }));

  const lines: string[] = [];

  if (top.sources.length >= 2) {
    lines.push(
      `- **${top.sources.length} scanners** saw the same thing (${top.sources.join(", ")}) — that reduces false-alarm risk.`,
    );
  } else if (top.sources[0]) {
    lines.push(`- Primary signal from **${top.sources[0]}** — cross-check with another source if you can.`);
  }

  for (const p of proof.slice(0, 3)) {
    lines.push(`- **${p.source}** reported: ${p.detail}`);
  }

  if (wb.totals.validated_paths > 0) {
    lines.push(
      `- **${wb.totals.validated_paths} attack path${wb.totals.validated_paths === 1 ? "" : "s"}** survived validation — the chain is not just a single alert.`,
    );
  } else if (wb.totals.rejected_paths > 0) {
    const topReason = summarizePathFailures(wb.candidate_paths)[0];
    lines.push(
      `- Candidate attack paths were **rejected**${topReason ? ` (often because: ${topReason.reason})` : ""} — we are not overstating reachability.`,
    );
  }

  return lines.join("\n") || `- ${top.title} on ${top.host || "target"} was retained for analyst review.`;
}

export function buildMissingSection(wb: WorkbenchData): string {
  const rows = missingEvidenceRows(wb);
  if (!rows.length) return "- Nothing critical is missing — optional deeper validation may still help.";
  return rows
    .map((r) => `- **${r.topic}** — ${r.reason}; would need: ${r.evidence_needed}`)
    .join("\n");
}

function buildCertaintySection(wb: WorkbenchData): string {
  const inv = topInvestigation(wb);
  const top = wb.confirmed_findings[0];

  if (inv?.confidence_explanation?.trim()) {
    return inv.confidence_explanation.trim();
  }

  if (!top) return "No retained finding — nothing to score.";

  const score = top.machine_confidence;
  const label = humanConfidenceLabel(score);
  const sem = semanticConfidence(top);
  const primary = sem ? CONFIDENCE_METRIC_LABEL[sem.primary.metric] : "overall signal";

  let text =
    `${label} (${score}%) based on **${primary}**. ` +
    "That reflects how strong the evidence is — not proof that someone already exploited it.";

  if (top.claim_status === "needs_validation") {
    text += " Status: **needs validation** before you assert compromise.";
  } else if (top.claim_status === "suspected") {
    text += " Status: **suspected** — exposure looks real, exploit not reproduced.";
  }

  const metrics = displayedConfidenceMetrics(top);
  if (metrics.length > 1) {
    const bits = metrics.map(({ label: l, metric }) => `${l} ${metric.score}%`).join(", ");
    text += `\n\nBreakdown: ${bits}. Ask \"Why is this ${score}%?\" for factor details.`;
  }

  return text;
}

function buildNextStepsSection(wb: WorkbenchData): string {
  const inv = topInvestigation(wb);
  if (inv?.immediate_action?.trim()) {
    return `- ${inv.immediate_action.trim()}`;
  }

  const missing = missingEvidenceRows(wb);
  const recommendation =
    missing[0]?.topic ||
    wb.next_actions[0] ||
    "Validate the highest-priority investigation before changing production systems.";

  return `- ${recommendation}${
    missing[0]?.expected_gain ? ` (could add ~${missing[0].expected_gain}% confidence)` : ""
  }`;
}

function buildWhatHappenedSection(wb: WorkbenchData): string {
  const inv = topInvestigation(wb);
  if (inv) {
    const lines: string[] = [`1. **${inv.title}** — ${inv.reason || "clustered security problem from multiple signals."}`];
    if (inv.affected_assets?.length) {
      lines.push(`2. **Affected:** ${inv.affected_assets.slice(0, 4).join(", ")}`);
    }
    if (inv.evidence_sources?.length) {
      lines.push(`3. **Evidence from:** ${inv.evidence_sources.join(", ")}`);
    }
    return lines.join("\n");
  }

  if (wb.executive_summary?.trim()) {
    return wb.executive_summary.trim();
  }

  const count = wb.confirmed_findings.length;
  return count
    ? `1. The engine retained **${count} finding${count === 1 ? "" : "s"}** after deduplication and validation.\n2. Review the priority queue for what matters most.`
    : "1. No findings met the retention threshold.";
}

export function buildAnalystNarrative(wb: WorkbenchData): string {
  return [
    "**In plain terms**",
    buildPlainTermsSection(wb),
    "",
    "**What happened**",
    buildWhatHappenedSection(wb),
    "",
    "**Why VAYNE believes it**",
    buildWhySection(wb),
    "",
    "**How certain**",
    buildCertaintySection(wb),
    "",
    "**Missing evidence**",
    buildMissingSection(wb),
    "",
    "**What should happen next**",
    buildNextStepsSection(wb),
  ].join("\n");
}

export function reconstructRejection(wb: WorkbenchData): string {
  const rejected = wb.candidate_paths.filter((p) => p.status === "REJECTED");
  if (!rejected.length) {
    return "**In plain terms**\nNo attack paths were ruled out — either none were proposed or all that mattered were kept.\n\n**Detail**\nNo candidate paths were rejected in this investigation.";
  }
  const summary = summarizePathFailures(wb.candidate_paths);
  const lines = [
    "**In plain terms**",
    `${rejected.length} possible attack route${rejected.length === 1 ? "" : "s"} looked interesting on paper but did not hold up against the evidence. That is good — it means we are not crying wolf.`,
    "",
    "**Rejection summary**",
    ...summary.map((r) => `- ${r.count}× ${r.reason}`),
    "",
    "**Examples**",
  ];
  for (const path of rejected.slice(0, 4)) {
    lines.push(
      `- Path: ${path.steps.join(" → ")}`,
      `  - Why it failed: ${normalizeFailureReason(path.reason)}`,
      path.missing[0]
        ? `  - Would need: ${path.missing[0]}`
        : "  - Would need: additional validation evidence",
    );
  }
  return lines.join("\n");
}
