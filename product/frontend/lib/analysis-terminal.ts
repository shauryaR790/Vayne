/** Simulated terminal lines keyed by progress threshold (0–100). */
export const ANALYSIS_TERMINAL_SCRIPT: { at: number; line: string }[] = [
  { at: 0, line: "starting engine… ready in 3.7s" },
  { at: 4, line: "loading ruleset v2.14 — 847 rules" },
  { at: 8, line: "parsing upload manifest" },
  { at: 12, line: "compiling GET /api/health 200 in 42ms" },
  { at: 18, line: "ingesting scan artifacts" },
  { at: 24, line: "normalizing host graph" },
  { at: 30, line: "correlating service fingerprints" },
  { at: 36, line: "GET /api/analyze 307 in 850ms" },
  { at: 42, line: "running false-positive classifier" },
  { at: 48, line: "enriching CVE intelligence" },
  { at: 54, line: "building capability transition map" },
  { at: 60, line: "searching attack paths — beam width 8" },
  { at: 66, line: "scoring confidence proofs" },
  { at: 72, line: "computing blast radius" },
  { at: 78, line: "generating remediation plan" },
  { at: 84, line: "writing investigation bundle" },
  { at: 90, line: "validating proof timeline" },
  { at: 95, line: "finalizing report artifacts" },
  { at: 99, line: "analysis complete — rendering report" },
];

export const MIN_ANALYSIS_MS = 11_000;

export function linesUpToProgress(progress: number): string[] {
  return ANALYSIS_TERMINAL_SCRIPT.filter((s) => s.at <= progress).map((s) => s.line);
}
