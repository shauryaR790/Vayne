import type { WorkbenchPriorityItem } from "./types";

/** Engine scoring labels that must never appear in analyst-facing UI. */
const INTERNAL_SCORING =
  /evidence class:|composite score|\(\+\d+\)|\(-\d+\)|\(\d+\/100\)|spoofable evidence|version flagged without|moderately spoofable/i;

export function isInternalScoringText(text: string): boolean {
  return INTERNAL_SCORING.test(text.trim());
}

export function sanitizeAnalystText(text: string, fallback = ""): string {
  const cleaned = text
    .trim()
    .replace(/\s*\(\d+\/100\)/g, "")
    .replace(/\s*\([+-]\d+\)/g, "")
    .replace(/\s*composite score \d+%\.?/gi, "")
    .trim();
  if (!cleaned || isInternalScoringText(cleaned)) return fallback;
  return cleaned;
}

type PurposeBlock = {
  why_analyst_should_care?: string;
  what_is_happening?: string;
};

type ExecutiveImpact = {
  customers?: string;
  brand?: string;
  operations?: string;
  compliance?: string;
};

export function investigationReason(item: WorkbenchPriorityItem): string {
  const fromContract = sanitizeAnalystText(item.reason_it_exists || "", "");
  if (fromContract) return fromContract;

  const purpose = item.purpose as PurposeBlock | undefined;
  const fromPurpose = sanitizeAnalystText(purpose?.why_analyst_should_care || "", "");
  if (fromPurpose) return fromPurpose;

  const cleanReasons = (item.priority_reasons || []).filter((r) => !isInternalScoringText(r));
  if (cleanReasons.length) return cleanReasons[0];

  const reason = sanitizeAnalystText(item.reason || "", "");
  if (reason) return reason;

  const assets = item.affected_assets?.length ?? 0;
  if (assets > 0) {
    return `${assets} affected asset${assets === 1 ? "" : "s"} — clustered evidence needs validation before you act.`;
  }
  return "Clustered scanner evidence flagged a security problem that needs analyst review.";
}

export function investigationBusinessImpact(item: WorkbenchPriorityItem): string {
  const exec = item.business_impact_executive as ExecutiveImpact | undefined;
  for (const key of ["customers", "brand", "operations", "compliance"] as const) {
    const line = sanitizeAnalystText(exec?.[key] || "", "");
    if (line) return line;
  }
  return sanitizeAnalystText(item.business_impact || "", "");
}

export function investigationConfidenceNote(item: WorkbenchPriorityItem): string {
  const raw = item.confidence_explanation || "";
  const cleaned = sanitizeAnalystText(raw, "");
  if (cleaned) return cleaned;
  const sources = item.evidence_sources?.length ?? 0;
  if (sources >= 2) return `${sources} scanners agree — validate before treating as confirmed compromise.`;
  return `${item.confidence}% confidence from available evidence — reproduction still required.`;
}
