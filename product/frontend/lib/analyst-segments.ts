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

function parseSectionBlock(section: string): { title: string; body: string } | null {
  const trimmed = section.trim();
  const match = trimmed.match(/^\*\*([^*]+)\*\*\s*\n?([\s\S]*)$/);
  if (!match) return null;
  return { title: match[1].trim(), body: match[2].trim() };
}

/** Push prose chunks — section heading only on the first chunk. */
function appendSectionChunks(
  segments: AnalystStreamSegment[],
  sectionText: string,
  fallbackTitle: string,
  maxChars: number,
) {
  const parsed = parseSectionBlock(sectionText);
  const title = parsed?.title ?? fallbackTitle;
  const body = (parsed?.body ?? sectionText).trim();
  const chunks = chunkProse(body, maxChars);
  if (!chunks.length) return;

  chunks.forEach((chunk, index) => {
    segments.push({
      type: "text",
      content: index === 0 ? `**${title}**\n${chunk}` : chunk,
    });
  });
}

function certaintySnippet(wb: WorkbenchData): string {
  const inv = wb.investigations?.[0] ?? wb.priority_queue?.[0];
  if (inv?.confidence_explanation?.trim()) {
    return `**How certain**\n${inv.confidence_explanation.trim()}`;
  }

  const top = wb.confirmed_findings[0];
  if (!top) return "**How certain**\nNo retained finding.";

  const sem = semanticConfidence(top);
  const score = top.machine_confidence;
  const label =
    score >= 85 ? "Fairly confident" : score >= 70 ? "Moderately confident" : score >= 50 ? "Cautiously confident" : "Low confidence";

  const line =
    `${label} (${score}%) on ${top.title}` +
    (sem
      ? ` — primary signal is ${CONFIDENCE_METRIC_LABEL[sem.primary.metric]}.`
      : ".") +
    " This reflects evidence strength, not proof of exploitation.";

  return `**How certain**\n${line}`;
}

function nextStepSnippet(wb: WorkbenchData): string {
  const inv = wb.investigations?.[0] ?? wb.priority_queue?.[0];
  if (inv?.immediate_action?.trim()) {
    return `**What should happen next**\n- ${inv.immediate_action.trim()}`;
  }

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
  options?: {
    intro?: string;
    prefix?: string;
    narrative?: string;
    uploadedFileCount?: number;
  },
): AnalystStreamSegment[] {
  const segments: AnalystStreamSegment[] = [];
  const uploadedCount =
    options?.uploadedFileCount ?? wb.totals.files ?? fileInsights.length;
  const scannerCards = fileInsights.length;

  if (options?.intro?.trim()) {
    for (const chunk of chunkProse(options.intro.trim(), 180)) {
      segments.push({ type: "text", content: chunk });
    }
  }
  if (options?.prefix?.trim()) {
    segments.push({ type: "text", content: options.prefix.trim() });
  }

  if (uploadedCount > 0 || scannerCards > 0) {
    const detail =
      uploadedCount > scannerCards && scannerCards > 0
        ? `${uploadedCount.toLocaleString()} files · ${scannerCards} scanner type${scannerCards === 1 ? "" : "s"}`
        : `${uploadedCount.toLocaleString()} file${uploadedCount === 1 ? "" : "s"}`;
    segments.push({
      type: "think",
      label: "Inspecting evidence",
      detail,
    });
  }

  const sections = splitNarrativeSections(
    options?.narrative ?? "",
  );

  const plainTerms = sections.find((s) => s.startsWith("**In plain terms")) ?? "";
  const whatHappened = sections.find((s) => s.startsWith("**What happened")) ?? sections[0] ?? "";
  const whySection = sections.find((s) => s.startsWith("**Why VAYNE")) ?? "";
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

  if (plainTerms) {
    appendSectionChunks(segments, plainTerms, "In plain terms", 240);
  }

  appendSectionChunks(segments, whatHappened || "", "What happened", 220);

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

  const whyBody = whySection || `**Why VAYNE believes it**\n${buildWhySection(wb)}`;
  appendSectionChunks(segments, whyBody, "Why VAYNE believes it", 260);

  segments.push({ type: "think", label: "Weighing confidence" });
  appendSectionChunks(segments, certaintySnippet(wb), "How certain", 220);

  appendSectionChunks(segments, missingSection, "Missing evidence", 220);

  appendSectionChunks(segments, nextStepSnippet(wb), "What should happen next", 200);

  return segments;
}

export function flattenSegmentText(segments: AnalystStreamSegment[]): string {
  return segments
    .filter((segment): segment is Extract<AnalystStreamSegment, { type: "text" }> => segment.type === "text")
    .map((segment) => segment.content)
    .join("\n\n");
}
