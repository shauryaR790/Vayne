/** Map engine findings and workbench rows back to uploaded evidence filenames. */

import type { WorkbenchConfirmedFinding, WorkbenchFileContribution } from "./types";

export function parseUploadedFilenames(...candidates: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of candidates) {
    if (!raw?.trim()) continue;
    for (const part of raw.split(/[,;|]/)) {
      const name = part.trim().split(/[/\\]/).pop()?.trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }

  return out;
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function toolInFilename(tool: string, filename: string): boolean {
  const toolNorm = normalizeToken(tool);
  const fileNorm = normalizeToken(filename.replace(/\.[^.]+$/, ""));
  if (!toolNorm || !fileNorm) return false;
  return fileNorm.includes(toolNorm) || toolNorm.includes(fileNorm);
}

export function matchSourceFile(
  filenames: string[],
  options?: {
    tool?: string;
    sources?: string[];
    contributions?: WorkbenchFileContribution[];
  },
): string | undefined {
  if (!filenames.length) return undefined;

  const tools = [
    options?.tool,
    ...(options?.sources ?? []),
  ].filter(Boolean) as string[];

  for (const tool of tools) {
    const fromFiles = filenames.find((file) => toolInFilename(tool, file));
    if (fromFiles) return fromFiles;

    const contribution = options?.contributions?.find(
      (row) =>
        normalizeToken(row.tool) === normalizeToken(tool) ||
        toolInFilename(row.tool, row.file),
    );
    if (contribution?.file && !contribution.file.toLowerCase().includes(" evidence")) {
      return contribution.file.split(/[/\\]/).pop() || contribution.file;
    }
  }

  return filenames.length === 1 ? filenames[0] : undefined;
}

export function findingSourceFile(
  finding: Pick<WorkbenchConfirmedFinding, "sources"> & { source_file?: string },
  filenames: string[],
  contributions?: WorkbenchFileContribution[],
): string | undefined {
  if (finding.source_file?.trim()) {
    return finding.source_file.split(/[/\\]/).pop() || finding.source_file;
  }
  return matchSourceFile(filenames, { sources: finding.sources, contributions });
}

export function isMultiSourceUpload(filenames: string[]): boolean {
  return filenames.length > 1;
}
