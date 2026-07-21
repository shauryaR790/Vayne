/** Helpers for compact multi-file upload UI. */

import { evidenceFormatLabel } from "@/components/workspace/evidence-queue";

export const STAGED_FILES_COMPACT_THRESHOLD = 6;
export const EVIDENCE_LIST_COMPACT_THRESHOLD = 6;

export function formatTotalFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function filenameTypeSummary(filenames: string[]): string {
  const counts = new Map<string, number>();
  for (const name of filenames) {
    const label = evidenceFormatLabel(name);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count]) => `${count} ${label}`)
    .join(" · ");
}

export function stagedFilesTypeSummary(files: File[]): string {
  return filenameTypeSummary(files.map((f) => f.name));
}

export function analysisPromptForFiles(filenames: string[]): string {
  if (filenames.length === 0) return "Analyze uploaded evidence";
  if (filenames.length === 1) return `Analyze ${filenames[0]}`;
  if (filenames.length <= 5) return `Analyze ${filenames.join(", ")}`;
  return `Analyze ${filenames.length} evidence files`;
}
