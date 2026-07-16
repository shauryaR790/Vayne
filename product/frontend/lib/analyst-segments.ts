import type { EngineFileInsight } from "@/lib/engine-file-insights";
import { buildMissingSection, buildWhySection } from "@/lib/analyst-narrative";
import type { WorkbenchData } from "@/lib/types";
import {
  CONFIDENCE_METRIC_LABEL,
  displayedConfidenceMetrics,
  missingEvidenceRows,
  semanticConfidence,
} from "@/lib/workbench-report-helpers";

export type AnalystStreamSegment =
  | { type: "text"; content: string }
  | { type: "file"; fileIndex: number }
  | { type: "think"; label: string; detail?: string };

function chunkProse(text: string, maxChars = 240): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const paragraphs = trimmed.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buffer = "";

  for (const paragraph of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      buffer = candidate;
      continue;
    }
    if (buffer) chunks.push(buffer);
    if (paragraph.length <= maxChars) {
      buffer = paragraph;
    } else {
      const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [paragraph];
      buffer = "";
      for (const sentence of sentences) {
        const next = buffer ? `${buffer} ${sentence.trim()}` : sentence.trim();
        if (next.length <= maxChars) {
          buffer = next;
        } else {
          if (buffer) chunks.push(buffer);
          buffer = sentence.trim();
        }
      }
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

function splitNarrativeSections(narrative: string): string[] {
  return narrative
    .split(/\n\n(?=\*\*)/)
    .map((section) => section.trim())
    .filter(Boolean);
}

function certaintySnippet(wb: WorkbenchData): string {
  const top = wb.confirmed_findings[0];
  if (!top) return "**How certain**\nNo retained finding.";

  const sem = semanticConfidence(top);
  const metricLine = displayedConfidenceMetrics(top)
    .map(({ label, metric }) => `${label} ${metric.score}%`)
    .join(" · ");

  const line =
    `${metricLine || `${top.machine_confidence}%`} on ${top.title}` +
    (sem
      ? ` — primary is ${CONFIDENCE_METRIC_LABEL[sem.primary.metric]}.`
      : ".");

  return `**How certain**\n${line}`;
}

function nextStepSnippet(wb: WorkbenchData): string {
  const missing = missingEvidenceRows(wb);
  const recommendation =
    missing[0]?.topic ||
    wb.next_actions[0] ||
    "Prioritize validation of the highest-confidence exposure before remediation.";

  return `**What should happen next**\n- ${recommendation}${
    missing[0]?.expected_gain ? ` (+${missing[0].expected_gain}% confidence)` : ""
  }`;
}

/** Interleaved text / think / file timeline for Cursor-style analyst turns. */
export function buildBriefingSegments(
  wb: WorkbenchData,
  fileInsights: EngineFileInsight[],
  options?: { intro?: string; prefix?: string; narrative?: string },
): AnalystStreamSegment[] {
  const segments: AnalystStreamSegment[] = [];

  if (options?.intro?.trim()) {
    for (const chunk of chunkProse(options.intro.trim(), 180)) {
      segments.push({ type: "text", content: chunk });
    }
  }
  if (options?.prefix?.trim()) {
    segments.push({ type: "text", content: options.prefix.trim() });
  }

  if (fileInsights.length) {
    segments.push({
      type: "think",
      label: "Inspecting evidence",
      detail: `${fileInsights.length} file${fileInsights.length === 1 ? "" : "s"}`,
    });
  }

  const sections = splitNarrativeSections(
    options?.narrative ?? "",
  );

  const whatHappened = sections.find((s) => s.startsWith("**What happened")) ?? sections[0] ?? "";
  const whySection = sections.find((s) => s.startsWith("**Why VANE")) ?? "";
  const missingSection =
    sections.find((s) => s.startsWith("**Missing evidence")) ??
    `**Missing evidence**\n${buildMissingSection(wb)}`;

  if (fileInsights[0]) {
    segments.push({
      type: "think",
      label: `Reading ${fileInsights[0].filename}`,
      detail: fileInsights[0].tool,
    });
    segments.push({ type: "file", fileIndex: 0 });
  }

  for (const chunk of chunkProse(whatHappened, 220)) {
    segments.push({
      type: "text",
      content: chunk.startsWith("**") ? chunk : `**What happened**\n${chunk}`,
    });
  }

  for (let i = 1; i < fileInsights.length; i++) {
    const file = fileInsights[i];
    segments.push({ type: "think", label: `Parsing ${file.filename}`, detail: file.tool });
    segments.push({ type: "file", fileIndex: i });
  }

  if (fileInsights.length > 1 || wb.totals.cross_source_matches > 0) {
    segments.push({
      type: "think",
      label: "Cross-correlating sources",
      detail: `${wb.confirmed_findings.length} retained`,
    });
  }

  const whyBody = whySection || `**Why VANE believes it**\n${buildWhySection(wb)}`;
  for (const chunk of chunkProse(whyBody, 260)) {
    segments.push({
      type: "text",
      content: chunk.startsWith("**") ? chunk : `**Why VANE believes it**\n${chunk}`,
    });
  }

  segments.push({ type: "think", label: "Weighing confidence" });
  for (const chunk of chunkProse(certaintySnippet(wb), 220)) {
    segments.push({ type: "text", content: chunk });
  }

  for (const chunk of chunkProse(missingSection, 220)) {
    segments.push({
      type: "text",
      content: chunk.startsWith("**") ? chunk : `**Missing evidence**\n${chunk}`,
    });
  }

  for (const chunk of chunkProse(nextStepSnippet(wb), 200)) {
    segments.push({ type: "text", content: chunk });
  }

  return segments;
}

export function flattenSegmentText(segments: AnalystStreamSegment[]): string {
  return segments
    .filter((segment): segment is Extract<AnalystStreamSegment, { type: "text" }> => segment.type === "text")
    .map((segment) => segment.content)
    .join("\n\n");
}
