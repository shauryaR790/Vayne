import { shortFilename } from "@/lib/evidence-presentation";
import type { InvestigationBundle } from "@/lib/investigation-bundle";
import type {
  WorkbenchConfirmedFinding,
  WorkbenchData,
  WorkbenchEvidenceSource,
  WorkbenchFileContribution,
} from "@/lib/types";

export type EngineFileInsightLineKind = "add" | "remove" | "context";

export interface EngineFileInsightLine {
  kind: EngineFileInsightLineKind;
  content: string;
}

export interface EngineFileInsight {
  id: string;
  filename: string;
  tool: string;
  extension: string;
  additions: number;
  deletions: number;
  lines: EngineFileInsightLine[];
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function sourceForContribution(
  workbench: WorkbenchData,
  contribution: WorkbenchFileContribution,
): WorkbenchEvidenceSource | undefined {
  const tool = normalizeKey(contribution.tool);
  return workbench.evidence_sources.find(
    (s) =>
      normalizeKey(s.label) === tool ||
      normalizeKey(s.tool) === tool ||
      normalizeKey(contribution.file).includes(normalizeKey(s.label)),
  );
}

function pipelineForSource(
  workbench: WorkbenchData,
  source?: WorkbenchEvidenceSource,
): string | undefined {
  if (!source) return undefined;
  const stage = workbench.pipeline.find(
    (p) => p.id === `parse:${source.tool}` || normalizeKey(p.label).includes(normalizeKey(source.label)),
  );
  return stage ? `${stage.label} · ${stage.detail} · ${stage.timestamp}` : undefined;
}

function findingsForSource(
  workbench: WorkbenchData,
  tool: string,
  file: string,
): WorkbenchConfirmedFinding[] {
  const keys = [normalizeKey(tool), normalizeKey(shortFilename(file))];
  return workbench.confirmed_findings.filter((finding) =>
    finding.sources.some((source) => {
      const s = normalizeKey(source);
      return keys.some((k) => k && (s.includes(k) || k.includes(s)));
    }),
  );
}

function guessToolFromFilename(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".nessus") || lower.includes("nessus")) return "nessus";
  if (lower.endsWith(".xml")) return "nmap";
  if (lower.endsWith(".json")) return "nuclei";
  if (lower.endsWith(".csv")) return "csv";
  return "";
}

function matchContributionForFilename(
  filename: string,
  contributions: WorkbenchFileContribution[],
): WorkbenchFileContribution | undefined {
  const short = shortFilename(filename);
  return contributions.find((c) => {
    const cf = shortFilename(c.file);
    return (
      cf === short ||
      normalizeKey(c.file).includes(normalizeKey(short)) ||
      normalizeKey(short).includes(normalizeKey(cf))
    );
  });
}

function matchSourceForFilename(
  filename: string,
  sources: WorkbenchEvidenceSource[],
  index: number,
): WorkbenchEvidenceSource | undefined {
  const hint = guessToolFromFilename(filename);
  if (hint) {
    const matched = sources.find(
      (s) =>
        normalizeKey(s.tool).includes(hint) ||
        normalizeKey(s.label).includes(hint) ||
        hint.includes(normalizeKey(s.tool)),
    );
    if (matched) return matched;
  }
  return sources[index] ?? sources[0];
}

function expandContributionsPerFile(
  workbench: WorkbenchData,
  declaredNames: string[],
  baseContributions: WorkbenchFileContribution[],
): WorkbenchFileContribution[] {
  if (declaredNames.length <= 1) {
    return baseContributions;
  }

  // Combined intake often produces one backend row — do not clone it per upload.
  if (baseContributions.length === 1) {
    return [{ ...baseContributions[0], file: declaredNames[0] || baseContributions[0].file }];
  }

  const usedFiles = new Set<string>();
  const results: WorkbenchFileContribution[] = [];

  for (const contrib of baseContributions) {
    const matchedName =
      declaredNames.find((name) => {
        if (usedFiles.has(name)) return false;
        return matchContributionForFilename(name, [contrib]);
      }) ??
      declaredNames.find((name) => {
        if (usedFiles.has(name)) return false;
        const hint = guessToolFromFilename(name);
        return hint && normalizeKey(contrib.tool).includes(hint);
      });

    const filename = matchedName || contrib.file;
    if (matchedName) usedFiles.add(matchedName);
    results.push({ ...contrib, file: filename });
  }

  for (let index = 0; index < declaredNames.length; index++) {
    const filename = declaredNames[index];
    if (usedFiles.has(filename)) continue;

    const source = matchSourceForFilename(filename, workbench.evidence_sources, index);
    const toolHint = guessToolFromFilename(filename);
    const alreadyCovered = results.some((row) => {
      const fileKey = normalizeKey(shortFilename(row.file));
      const toolKey = normalizeKey(row.tool);
      return (
        fileKey === normalizeKey(shortFilename(filename)) ||
        (toolHint && toolKey.includes(toolHint)) ||
        (source && toolKey === normalizeKey(source.tool))
      );
    });
    if (alreadyCovered) continue;

    if (source) {
      results.push(contributionFromSource(source, filename));
      usedFiles.add(filename);
    }
  }

  return results.length ? results : baseContributions;
}

function buildLines(
  contribution: WorkbenchFileContribution,
  source: WorkbenchEvidenceSource | undefined,
  parseStage: string | undefined,
  retained: WorkbenchConfirmedFinding[],
  mergedSecondary = false,
  companionFiles: string[] = [],
): EngineFileInsightLine[] {
  const lines: EngineFileInsightLine[] = [];

  lines.push({
    kind: "context",
    content: `# ${source?.label ?? contribution.tool} parser · ${contribution.hosts} host(s) · ${contribution.signals} signal(s)`,
  });

  if (companionFiles.length > 0) {
    lines.push({
      kind: "context",
      content: `  combined intake: ${companionFiles.map((name) => shortFilename(name)).join(", ")}`,
    });
  }

  if (parseStage) {
    lines.push({ kind: "context", content: `  ${parseStage}` });
  }

  if (source) {
    lines.push({
      kind: "context",
      content: `  objects ${source.objects} · findings ${source.findings} · status ${source.status}`,
    });
    if (source.note?.trim()) {
      lines.push({ kind: "context", content: `  note: ${source.note.trim()}` });
    }
  }

  if (contribution.findings === 0 && contribution.signals === 0) {
    if (mergedSecondary) {
      lines.push({
        kind: "context",
        content: "  merged into combined parser intake — findings attributed to primary scan file",
      });
    } else {
      lines.push({ kind: "context", content: "  no correlated observations from this source" });
    }
  }

  for (const finding of retained.slice(0, 4)) {
    const host = finding.host ? ` @ ${finding.host}` : "";
    lines.push({
      kind: "add",
      content: `retained: ${finding.title}${host} — ${finding.machine_confidence}% (${finding.status})`,
    });
  }

  const retainedExtra = Math.max(0, contribution.retained - Math.min(retained.length, 4));
  if (retainedExtra > 0) {
    lines.push({
      kind: "add",
      content: `+ ${retainedExtra} additional retained finding${retainedExtra === 1 ? "" : "s"} from this source`,
    });
  }

  if (contribution.rejected > 0) {
    const dropped = Math.max(0, contribution.findings - contribution.retained);
    lines.push({
      kind: "remove",
      content: `rejected: ${contribution.rejected} finding${contribution.rejected === 1 ? "" : "s"} below evidence threshold`,
    });
    if (dropped > contribution.rejected) {
      lines.push({
        kind: "remove",
        content: `filtered: ${dropped - contribution.rejected} duplicate or weak correlation(s)`,
      });
    }
  }

  if (source && (source.critical > 0 || source.high > 0)) {
    lines.push({
      kind: "context",
      content: `  severity mix: ${source.critical} critical · ${source.high} high · ${source.medium} medium`,
    });
  }

  return lines;
}

function dedupeFileInsights(insights: EngineFileInsight[]): EngineFileInsight[] {
  const unique: EngineFileInsight[] = [];
  const seenFiles = new Set<string>();
  const seenBodies = new Set<string>();

  for (const insight of insights) {
    const fileKey = normalizeKey(insight.filename);
    const bodyKey = [
      normalizeKey(insight.tool),
      insight.additions,
      insight.deletions,
      insight.lines.map((line) => line.content).join("|"),
    ].join("::");

    if (seenFiles.has(fileKey) || seenBodies.has(bodyKey)) continue;
    seenFiles.add(fileKey);
    seenBodies.add(bodyKey);
    unique.push(insight);
  }

  return unique;
}

function contributionFromSource(
  source: WorkbenchEvidenceSource,
  filename: string,
): WorkbenchFileContribution {
  return {
    file: filename,
    tool: source.label,
    findings: source.findings,
    retained: source.retained,
    rejected: Math.max(0, source.findings - source.retained),
    signals: source.objects,
    hosts: 0,
  };
}

/** Build Cursor-style per-file engine insight blocks from live workbench data. */
export function buildEngineFileInsights(
  workbench: WorkbenchData,
  options?: {
    bundle?: InvestigationBundle;
    sourceLabel?: string;
    sourceLabels?: string[];
  },
): EngineFileInsight[] {
  const bundle = options?.bundle;
  const uploaded =
    options?.sourceLabel ||
    bundle?.report?.target?.split(/[/\\]/).pop() ||
    bundle?.detail?.summary?.name ||
    "";

  const declaredNames =
    options?.sourceLabels?.filter(Boolean) ||
    (bundle?.report?.target
      ? [bundle.report.target.split(/[/\\]/).pop() || bundle.report.target]
      : undefined);

  let contributions = workbench.file_contributions.length
    ? workbench.file_contributions
    : workbench.evidence_sources.map((source, i) =>
        contributionFromSource(
          source,
          declaredNames?.[i] || declaredNames?.[0] || uploaded || `${source.label} evidence`,
        ),
      );

  if (declaredNames?.length) {
    contributions = expandContributionsPerFile(workbench, declaredNames, contributions);
  } else if (contributions.length < workbench.evidence_sources.length) {
    contributions = workbench.evidence_sources.map((source, i) => {
      const existing = contributions[i];
      if (existing) return existing;
      return contributionFromSource(
        source,
        declaredNames?.[i] || `${source.label} evidence`,
      );
    });
  }

  if (!contributions.length) {
    const intake = workbench.pipeline.find((p) => p.id === "intake");
    const summary = workbench.executive_summary?.trim();
    if (intake || summary || workbench.totals.files > 0) {
      return [
        {
          id: "engine-run",
          filename: shortFilename(uploaded || "investigation"),
          tool: "VANE",
          extension: fileExtension(uploaded || ""),
          additions: workbench.totals.confirmed_findings ?? workbench.confirmed_findings.length,
          deletions: workbench.candidate_paths.filter((p) => p.status === "REJECTED").length,
          lines: [
            {
              kind: "context" as const,
              content: `# engine run · ${workbench.totals.files} file(s) · ${workbench.totals.sources} source(s)`,
            },
            intake
              ? { kind: "context" as const, content: `  ${intake.label} · ${intake.detail}` }
              : null,
            summary ? { kind: "add" as const, content: summary.slice(0, 280) } : null,
            ...workbench.confirmed_findings.slice(0, 3).map((f) => ({
              kind: "add" as const,
              content: `retained: ${f.title}${f.host ? ` @ ${f.host}` : ""} — ${f.machine_confidence}%`,
            })),
          ].filter(Boolean) as EngineFileInsightLine[],
        },
      ];
    }
    return [];
  }

  return dedupeFileInsights(
    contributions.map((contribution, index) => {
      const filename =
        contribution.file.includes("evidence") && declaredNames?.[index]
          ? declaredNames[index]
          : contribution.file || declaredNames?.[index] || uploaded || `${contribution.tool}.scan`;

      const source = sourceForContribution(workbench, contribution);
      const retained = findingsForSource(workbench, contribution.tool, filename);
      const parseStage = pipelineForSource(workbench, source);
      const mergedSecondary =
        Boolean(declaredNames && declaredNames.length > 1) &&
        contribution.retained === 0 &&
        contribution.findings === 0 &&
        index > 0;
      const companionFiles =
        declaredNames &&
        declaredNames.length > 1 &&
        contributions.length === 1 &&
        index === 0
          ? declaredNames.slice(1)
          : [];

      return {
        id: `${normalizeKey(contribution.tool)}-${normalizeKey(shortFilename(filename))}-${index}`,
        filename: shortFilename(filename),
        tool: contribution.tool,
        extension: fileExtension(filename),
        additions: contribution.retained,
        deletions: contribution.rejected,
        lines: buildLines(
          contribution,
          source,
          parseStage,
          retained,
          mergedSecondary,
          companionFiles,
        ),
      };
    }),
  );
}

/** Resolve file boxes for a stored assistant message (persisted or recomputed from bundle). */
export function resolveMessageFileInsights(
  message: { id: string; fileInsights?: EngineFileInsight[] },
  bundle: InvestigationBundle | null | undefined,
  sourceLabels?: string[],
): EngineFileInsight[] | undefined {
  if (message.fileInsights?.length) {
    const deduped = dedupeFileInsights(message.fileInsights);
    return deduped.length ? deduped : undefined;
  }
  if (!message.id.startsWith("brief-analyst-") || !bundle?.workbench) return undefined;
  const insights = buildEngineFileInsights(bundle.workbench, {
    bundle,
    sourceLabels,
    sourceLabel: sourceLabels?.[0],
  });
  return insights.length ? insights : undefined;
}
