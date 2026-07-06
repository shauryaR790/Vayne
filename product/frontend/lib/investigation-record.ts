import type { InvestigationBundle } from "./investigation-bundle";
import {
  buildInvestigationCardMetaFromBundle,
  extractSourceFile,
  looksLikeFilename,
} from "./investigation-metadata";
import { shortFilename } from "./evidence-presentation";

export type InvestigationResultKind = "summary" | "graph" | "findings" | "attack_paths";

export const INVESTIGATION_RESULT_LABELS: Record<InvestigationResultKind, string> = {
  summary: "summary",
  graph: "graph",
  findings: "findings",
  attack_paths: "attack paths",
};

export interface InvestigationRecordMeta {
  displayId: string;
  name: string;
  files: string[];
  createdAt: string;
  results: InvestigationResultKind[];
}

export function formatDisplayInvestigationId(createdAt: string, sequenceIndex: number): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return `inv_unknown_${String(sequenceIndex).padStart(3, "0")}`;
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const seq = String(sequenceIndex).padStart(3, "0");
  return `inv_${y}${m}${d}_${seq}`;
}

export function formatInvestigationRecordTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function deriveInvestigationFiles(bundle: InvestigationBundle, sourceLabel?: string): string[] {
  const fromLabel =
    sourceLabel
      ?.split(/,\s*/)
      .map((part) => shortFilename(part.trim()))
      .filter(Boolean) ?? [];

  if (fromLabel.length) return fromLabel;

  const fromMeta = extractSourceFile(sourceLabel, bundle.report);
  if (fromMeta) return [shortFilename(fromMeta)];

  const target = bundle.report.target?.split(/[/\\]/).pop()?.trim();
  if (target && looksLikeFilename(target)) return [shortFilename(target)];

  return [];
}

function deriveAvailableResults(bundle: InvestigationBundle): InvestigationResultKind[] {
  const results: InvestigationResultKind[] = ["summary"];

  const hasGraph =
    (bundle.graph?.nodes?.length ?? 0) > 0 || (bundle.graph?.edges?.length ?? 0) > 0;
  if (hasGraph) results.push("graph");

  const findingsCount =
    bundle.findings.validated.length || bundle.report.stats.findings_retained || 0;
  if (findingsCount > 0) results.push("findings");

  if (bundle.detail.attack_paths.length > 0) results.push("attack_paths");

  return results;
}

export function buildInvestigationRecordMeta(
  bundle: InvestigationBundle,
  options: { sourceLabel?: string; sequenceIndex?: number } = {},
): InvestigationRecordMeta {
  const sequenceIndex = options.sequenceIndex ?? 1;
  const createdAt = bundle.detail.summary.created_at;
  const meta = buildInvestigationCardMetaFromBundle(bundle, options.sourceLabel);

  return {
    displayId: formatDisplayInvestigationId(createdAt, sequenceIndex),
    name: meta.title,
    files: deriveInvestigationFiles(bundle, options.sourceLabel),
    createdAt: formatInvestigationRecordTimestamp(createdAt),
    results: deriveAvailableResults(bundle),
  };
}
