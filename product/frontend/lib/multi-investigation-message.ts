import type { InvestigationBundle } from "./investigation-bundle";
import { investigationLinksFooter } from "./conversation-links";
import {
  buildInvestigationCardMetaFromBundle,
  displayRiskLevel,
  type RiskLevel,
} from "./investigation-metadata";

export interface MessageAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
}

import { fileTypeLabel } from "./upload";

export function attachmentsFromFiles(files: File[]): MessageAttachment[] {
  return files.map((file) => ({
    id: `${file.name}:${file.size}:${file.lastModified}`,
    name: file.name,
    type: fileTypeLabel(file.name),
    size: file.size,
  }));
}

function riskLabel(bundle: InvestigationBundle): RiskLevel {
  return displayRiskLevel({
    riskScore: bundle.detail.summary.attack_surface_score,
    criticalCount: bundle.detail.summary.critical_count,
    risk: bundle.report.attack_surface_classification as RiskLevel | undefined,
  });
}

export function buildSeparateInvestigationsMessage(bundles: InvestigationBundle[]): string {
  const count = bundles.length;
  const lines = [
    `I analyzed ${count} independent environment${count === 1 ? "" : "s"}.`,
    "",
  ];

  bundles.forEach((bundle, index) => {
    const meta = buildInvestigationCardMetaFromBundle(bundle);
    const invId = bundle.detail.summary.id;
    const fileName = meta.sourceFile || bundle.report.target?.split(/[/\\]/).pop() || "Evidence file";

    lines.push(
      "--------------------------------",
      `INVESTIGATION ${index + 1}`,
      `File: ${fileName}`,
      `Risk: ${riskLabel(bundle)}`,
      `Summary: ${meta.summary}`,
      "",
      investigationLinksFooter(invId).trim(),
      "",
    );
  });

  return lines.join("\n").trim();
}

export function buildCombinedInvestigationsPrefix(fileNames: string[]): string {
  if (fileNames.length <= 1) return "";
  const evidence = fileNames.map((name) => `- ${name}`).join("\n");
  return [
    `I correlated ${fileNames.length} evidence sources into a single investigation.`,
    "",
    "Evidence:",
    evidence,
    "",
  ].join("\n");
}
