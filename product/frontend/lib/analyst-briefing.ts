import {
  buildInvestigationPresentation,
  type FindingCardData,
  type InvestigationPresentation,
} from "@/lib/investigation-presentation";
import type { InvestigationBundle } from "@/lib/investigation-bundle";
import type { StoredChatMessage } from "@/lib/conversation-session";

function findingsAnalystNote(findings: FindingCardData[]): string {
  if (!findings.length) return "No findings met the retention threshold.";
  const high = findings.filter((f) => f.confidence >= 80);
  const support = findings.length - high.length;
  const lead = high[0];
  const parts = [
    lead
      ? `VANE retained ${lead.finding} on ${lead.asset} because service fingerprinting, exposure context, and exploit preconditions aligned at ${lead.confidence}% confidence.`
      : `VANE retained ${findings.length} correlated finding${findings.length === 1 ? "" : "s"} from the evidence pipeline.`,
  ];
  if (support > 0) {
    parts.push(
      `Most other findings represent supporting evidence rather than independent compromise paths — their value is strengthening exploit confidence.`,
    );
  }
  return parts.join(" ");
}

function collectPresentationNotes(
  presentation: InvestigationPresentation,
  label?: string,
): string[] {
  const notes: string[] = [];
  const prefix = label ? `[${label}] ` : "";

  if (presentation.executive.analystNote) {
    notes.push(`${prefix}${presentation.executive.analystNote}`);
  }
  if (presentation.graphAnalystNote) {
    notes.push(`${prefix}${presentation.graphAnalystNote}`);
  }
  const pathNote =
    presentation.topPath?.analystNote || presentation.chainsAnalystNote;
  if (pathNote) notes.push(`${prefix}${pathNote}`);
  const findingsNote = findingsAnalystNote(presentation.findings);
  if (findingsNote) notes.push(`${prefix}${findingsNote}`);
  if (presentation.breakdown.analystNote) {
    notes.push(`${prefix}${presentation.breakdown.analystNote}`);
  }

  const seen = new Set<string>();
  return notes.filter((note) => {
    const key = note.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildAnalystBriefingMessages(
  bundles: InvestigationBundle[],
  options?: {
    intro?: string;
    sourceLabels?: string[];
  },
): StoredChatMessage[] {
  const messages: StoredChatMessage[] = [];
  const ts = Date.now();

  if (options?.intro?.trim()) {
    messages.push({
      id: `brief-intro-${ts}`,
      role: "assistant",
      content: options.intro.trim(),
    });
  }

  bundles.forEach((bundle, index) => {
    const label =
      options?.sourceLabels?.[index] ||
      bundle.report.target?.split(/[/\\]/).pop() ||
      undefined;
    const presentation = buildInvestigationPresentation(bundle, label);
    const notes = collectPresentationNotes(presentation, label);

    notes.forEach((content, noteIndex) => {
      messages.push({
        id: `brief-${bundle.detail.summary.id}-${noteIndex}`,
        role: "assistant",
        content,
      });
    });
  });

  return messages;
}
