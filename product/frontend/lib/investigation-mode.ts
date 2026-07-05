export type InvestigationMode = "combined" | "separate";

const SEPARATE_KEYWORDS = [
  "separate",
  "individually",
  "each file",
  "separate reports",
  "separate report",
  "treat independently",
  "analyze one by one",
  "one by one",
  "independently",
  "different environments",
  "different environment",
] as const;

const COMBINED_KEYWORDS = [
  "correlate",
  "combined",
  "merge",
  "single investigation",
  "same environment",
  "together",
] as const;

export function resolveInvestigationMode(
  fileCount: number,
  prompt: string,
  explicit?: InvestigationMode | null,
): InvestigationMode {
  if (fileCount <= 1) return "combined";

  if (explicit === "combined" || explicit === "separate") {
    return explicit;
  }

  const text = prompt.trim().toLowerCase();
  if (text) {
    if (SEPARATE_KEYWORDS.some((keyword) => text.includes(keyword))) {
      return "separate";
    }
    if (COMBINED_KEYWORDS.some((keyword) => text.includes(keyword))) {
      return "combined";
    }
  }

  return "combined";
}

export function defaultInvestigationMode(
  fileCount: number,
  prompt: string,
): InvestigationMode {
  return resolveInvestigationMode(fileCount, prompt);
}
