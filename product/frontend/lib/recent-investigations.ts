import { getFindings, getInvestigation, getReport } from "./api";
import type { InvestigationBundle } from "./investigation-bundle";
import type { FindingsData, InvestigationDetail, InvestigationReport } from "./types";

export interface RecentInvestigation {
  id: string;
  name: string;
  createdAt: string;
  pathCount?: number;
  findingsCount?: number;
  durationSeconds?: number;
  avgConfidence?: number | null;
  riskScore?: number;
  criticalCount?: number;
  surfaceClassification?: string;
  headline?: string;
  primaryHost?: string;
  assetCount?: number;
  rejectedPaths?: number;
  pathCategory?: string;
  blastRadius?: number;
  topCve?: string;
}

const STORAGE_KEY = "vayne-recent-investigations";
const MAX = 4;

function truncate(text: string, max: number) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function hostFromReport(report: InvestigationReport): string | undefined {
  const target = report.target?.trim();
  if (target) {
    const leaf = target.split(/[/\\]/).pop();
    return leaf ? truncate(leaf, 48) : truncate(target, 48);
  }
  const asset = report.assets?.[0] as { host?: string; name?: string; label?: string } | undefined;
  const value = asset?.host || asset?.name || asset?.label;
  return value ? truncate(String(value), 48) : undefined;
}

function cveFromText(...parts: Array<string | undefined>) {
  for (const part of parts) {
    const match = part?.match(/CVE-\d{4}-\d+/i);
    if (match) return match[0].toUpperCase();
  }
  return undefined;
}

function fallbackHeadline(
  detail: InvestigationDetail,
  report: InvestigationReport,
  findings: FindingsData,
): string {
  const rejected = report.stats.paths_rejected ?? 0;
  const explored = report.stats.paths_explored ?? 0;
  const surface = (detail.summary.attack_surface_classification ?? "mapped").replace(/_/g, " ");

  if (rejected > 0) {
    return truncate(
      `${rejected} chain${rejected === 1 ? "" : "s"} rejected · ${explored || "no"} explored · surface ${surface}`,
      72,
    );
  }
  if (findings.validated.length > 0) {
    return truncate(`${findings.validated.length} findings retained · surface ${surface}`, 72);
  }
  return truncate(`Surface ${surface} · no validated exploit chain`, 72);
}

export function recentEntryFromParts(
  detail: InvestigationDetail,
  report: InvestigationReport,
  findings: FindingsData,
  label?: string,
): RecentInvestigation {
  const paths = detail.attack_paths;
  const path = paths[0];
  const finding = findings.validated[0];
  const headlineSource =
    path?.title || finding?.title || finding?.reasoning?.[0] || fallbackHeadline(detail, report, findings);

  return {
    id: detail.summary.id,
    name: label || detail.summary.name || detail.summary.id.slice(0, 8),
    createdAt: detail.summary.created_at || new Date().toISOString(),
    pathCount: detail.summary.path_count,
    findingsCount: report.stats.findings_retained,
    durationSeconds: report.duration_seconds,
    avgConfidence:
      paths.length > 0
        ? Math.round(paths.reduce((s, p) => s + p.confidence, 0) / paths.length)
        : null,
    riskScore: detail.summary.attack_surface_score,
    criticalCount: detail.summary.critical_count,
    surfaceClassification: detail.summary.attack_surface_classification,
    headline: truncate(headlineSource, 72),
    primaryHost: finding?.host || hostFromReport(report),
    assetCount: report.assets?.length ?? report.discovered_assets?.length ?? 0,
    rejectedPaths: report.stats.paths_rejected ?? 0,
    pathCategory: path?.category,
    blastRadius: path?.blast_radius,
    topCve: finding?.cve || cveFromText(path?.title, finding?.title),
  };
}

export function recentEntryFromBundle(data: InvestigationBundle, label?: string): RecentInvestigation {
  return recentEntryFromParts(data.detail, data.report, data.findings, label);
}

export async function enrichRecentInvestigation(
  entry: RecentInvestigation,
): Promise<RecentInvestigation> {
  try {
    const [detail, report, findings] = await Promise.all([
      getInvestigation(entry.id),
      getReport(entry.id),
      getFindings(entry.id),
    ]);
    return recentEntryFromParts(detail, report, findings, entry.name);
  } catch {
    return entry;
  }
}

export function loadRecentInvestigations(): RecentInvestigation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentInvestigation[];
  } catch {
    return [];
  }
}

export function saveRecentInvestigation(entry: RecentInvestigation) {
  if (typeof window === "undefined") return;
  const existing = loadRecentInvestigations().filter((i) => i.id !== entry.id);
  const next = [entry, ...existing].slice(0, MAX);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
