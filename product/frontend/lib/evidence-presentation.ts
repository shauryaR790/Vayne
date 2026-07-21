import type { MessageAttachment } from "./multi-investigation-message";
import { fileTypeLabel } from "./upload";

export function shortFilename(name: string): string {
  return name.split(/[/\\]/).pop() || name;
}

export function evidenceTypeLabel(filename: string): string {
  const base = fileTypeLabel(filename);
  if (base === "Nessus Scan") return "Nessus scan evidence";
  if (base.endsWith(" File")) return `${base.replace(/ File$/, "")} evidence`;
  return `${base} evidence`;
}

export function isInvestigationSubmission(
  content: string,
  attachments?: MessageAttachment[],
): boolean {
  if (!attachments?.length) return false;
  const trimmed = content.trim();
  if (!trimmed) return true;
  if (/^Analyze\b/i.test(trimmed)) return true;
  return attachments.some((a) => trimmed.includes(a.name));
}

export interface InvestigationRequestMeta {
  headline: string;
  scope: string;
  fileCount: number;
}

export function buildInvestigationRequestMeta(
  attachments: MessageAttachment[],
): InvestigationRequestMeta {
  const count = attachments.length;
  const names = attachments.map((a) => shortFilename(a.name));

  if (count === 1) {
    return {
      fileCount: 1,
      headline: "Analyze uploaded evidence",
      scope: names[0],
    };
  }

  return {
    fileCount: count,
    headline: `Analyze ${count} uploaded evidence sets`,
    scope:
      count > 8
        ? `${count} files (${names.slice(0, 3).join(", ")} + ${count - 3} more)`
        : names.join(" + "),
  };
}
