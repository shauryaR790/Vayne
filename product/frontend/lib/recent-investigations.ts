import { getFindings, getInvestigation, getReport, listInvestigations } from "./api";
import {
  buildInvestigationCardMeta,
  displayInvestigationSummary,
  displayInvestigationTitle,
  displayRiskLevel,
  extractSourceFile,
  looksLikeFilename,
  type RiskLevel,
} from "./investigation-metadata";
import type { InvestigationBundle } from "./investigation-bundle";
import type { FindingsData, InvestigationDetail, InvestigationReport } from "./types";

export interface RecentInvestigation {
  id: string;
  title?: string;
  summary?: string;
  risk?: RiskLevel;
  createdAt: string;
  updatedAt?: string;
  sourceFile?: string;
  findingsHash?: string;
  /** @deprecated Use title */
  name?: string;
  /** @deprecated Use summary */
  headline?: string;
  /** @deprecated Use sourceFile */
  sourceFilename?: string;
  pathCount?: number;
  findingsCount?: number;
  durationSeconds?: number;
  avgConfidence?: number | null;
  riskScore?: number;
  criticalCount?: number;
  surfaceClassification?: string;
  primaryHost?: string;
  assetCount?: number;
  rejectedPaths?: number;
  pathCategory?: string;
  blastRadius?: number;
  topCve?: string;
}

export type InvestigationDateGroup = "today" | "yesterday" | "older";
export type SidebarHistoryGroup = "today" | "yesterday" | "last_week" | "older";

const STORAGE_KEY = "vayne-recent-investigations";
export const RECENT_INVESTIGATIONS_STORAGE_KEY = STORAGE_KEY;
export const SIDEBAR_HISTORY_MAX = 20;
export const SIDEBAR_RECENTS_MAX = 8;
export const HOME_RECENTS_MAX = 6;

export const RECENT_INVESTIGATIONS_UPDATED = "vayne:recent-investigations-updated";

export function normalizeSourceFilename(name?: string): string | undefined {
  if (!name?.trim()) return undefined;
  const leaf = name.trim().split(/[/\\]/).pop()?.trim().toLowerCase();
  return leaf || undefined;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getInvestigationDateGroup(iso: string): InvestigationDateGroup {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "older";

  const now = new Date();
  const today = startOfDay(now).getTime();
  const yesterday = today - 86_400_000;
  const ts = date.getTime();

  if (ts >= today) return "today";
  if (ts >= yesterday) return "yesterday";
  return "older";
}

export function getSidebarHistoryGroup(iso: string): SidebarHistoryGroup {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "older";

  const now = new Date();
  const today = startOfDay(now).getTime();
  const yesterday = today - 86_400_000;
  const weekAgo = today - 7 * 86_400_000;
  const ts = date.getTime();

  if (ts >= today) return "today";
  if (ts >= yesterday) return "yesterday";
  if (ts >= weekAgo) return "last_week";
  return "older";
}

function historyTimestamp(item: RecentInvestigation): string {
  return item.updatedAt || item.createdAt;
}

export function formatInvestigationTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const group = getInvestigationDateGroup(iso);
  if (group === "yesterday") return "Yesterday";

  const ms = Date.now() - date.getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (group === "today") return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function hostFromReport(report: InvestigationReport): string | undefined {
  const target = report.target?.trim();
  if (target) {
    const leaf = target.split(/[/\\]/).pop();
    return leaf ? leaf.slice(0, 48) : target.slice(0, 48);
  }
  const asset = report.assets?.[0] as { host?: string; name?: string; label?: string } | undefined;
  const value = asset?.host || asset?.name || asset?.label;
  return value ? String(value).slice(0, 48) : undefined;
}

function cveFromText(...parts: Array<string | undefined>) {
  for (const part of parts) {
    const match = part?.match(/CVE-\d{4}-\d+/i);
    if (match) return match[0].toUpperCase();
  }
  return undefined;
}

function normalizeEntry(entry: RecentInvestigation): RecentInvestigation {
  const sourceFile =
    entry.sourceFile ||
    entry.sourceFilename ||
    (looksLikeFilename(entry.name) ? entry.name : undefined);

  return {
    ...entry,
    title: entry.title?.trim() ? entry.title : displayInvestigationTitle(entry),
    summary: entry.summary?.trim() ? entry.summary : displayInvestigationSummary(entry),
    risk: displayRiskLevel(entry),
    sourceFile,
    sourceFilename: sourceFile ? normalizeSourceFilename(sourceFile) : entry.sourceFilename,
  };
}

function dedupeById(items: RecentInvestigation[]): RecentInvestigation[] {
  const byId = new Map<string, RecentInvestigation>();
  for (const item of items.map(normalizeEntry)) {
    const existing = byId.get(item.id);
    if (
      !existing ||
      new Date(item.createdAt).getTime() >= new Date(existing.createdAt).getTime()
    ) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values());
}

function contentSignature(item: RecentInvestigation): string | null {
  const normalized = normalizeEntry(item);
  const title = normalized.title?.trim().toLowerCase();
  const summary = normalized.summary?.trim().toLowerCase();
  if (!title || !summary) return null;
  return [
    title,
    summary,
    normalized.risk || "LOW",
    normalized.sourceFile ? normalizeSourceFilename(normalized.sourceFile) : "",
  ].join("|");
}

function dedupeByFindingsHash(items: RecentInvestigation[]): RecentInvestigation[] {
  const sorted = sortRecentFirst(items.map(normalizeEntry));
  const seen = new Set<string>();
  const result: RecentInvestigation[] = [];

  for (const item of sorted) {
    if (item.findingsHash) {
      if (seen.has(item.findingsHash)) continue;
      seen.add(item.findingsHash);
    }
    result.push(item);
  }

  return result;
}

function dedupeByContentSignature(items: RecentInvestigation[]): RecentInvestigation[] {
  const sorted = sortRecentFirst(items.map(normalizeEntry));
  const seen = new Set<string>();
  const result: RecentInvestigation[] = [];

  for (const item of sorted) {
    const signature = contentSignature(item);
    if (signature) {
      if (seen.has(signature)) continue;
      seen.add(signature);
    }
    result.push(item);
  }

  return result;
}

function dedupeBySourceAndHash(items: RecentInvestigation[]): RecentInvestigation[] {
  const sorted = sortRecentFirst(items.map(normalizeEntry));
  const seen = new Set<string>();
  const result: RecentInvestigation[] = [];

  for (const item of sorted) {
    const fileKey = item.sourceFile ? normalizeSourceFilename(item.sourceFile) : null;
    const composite =
      fileKey && item.findingsHash ? `${fileKey}::${item.findingsHash}` : null;

    if (composite) {
      if (seen.has(composite)) continue;
      seen.add(composite);
    }

    result.push(item);
  }

  return result;
}

function sortRecentFirst(items: RecentInvestigation[]): RecentInvestigation[] {
  return [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function prepareInvestigationList(
  items: RecentInvestigation[],
  limit: number = SIDEBAR_HISTORY_MAX,
): RecentInvestigation[] {
  return sortRecentFirst(
    dedupeByContentSignature(
      dedupeByFindingsHash(dedupeBySourceAndHash(dedupeById(items))),
    ),
  ).slice(0, limit);
}

function loadRawRecentInvestigations(): RecentInvestigation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentInvestigation[];
  } catch {
    return [];
  }
}

function persistInvestigationList(items: RecentInvestigation[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function notifyRecentUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RECENT_INVESTIGATIONS_UPDATED));
}

export function clearRecentInvestigations() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  notifyRecentUpdated();
}

export function recentEntryFromParts(
  detail: InvestigationDetail,
  report: InvestigationReport,
  findings: FindingsData,
  sourceFileLabel?: string,
): RecentInvestigation {
  const paths = detail.attack_paths;
  const path = paths[0];
  const finding = findings.validated[0];
  const meta = buildInvestigationCardMeta(detail, report, findings, sourceFileLabel);
  const now = new Date().toISOString();

  return {
    id: detail.summary.id,
    title: meta.title,
    summary: meta.summary,
    risk: meta.risk,
    createdAt: detail.summary.created_at || now,
    updatedAt: now,
    sourceFile: meta.sourceFile,
    findingsHash: meta.findingsHash,
    name: meta.title,
    headline: meta.summary,
    sourceFilename: meta.sourceFile ? normalizeSourceFilename(meta.sourceFile) : undefined,
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
    primaryHost: finding?.host || hostFromReport(report),
    assetCount: report.assets?.length ?? report.discovered_assets?.length ?? 0,
    rejectedPaths: report.stats.paths_rejected ?? 0,
    pathCategory: path?.category,
    blastRadius: path?.blast_radius,
    topCve: finding?.cve || cveFromText(path?.title, finding?.title),
  };
}

export function recentEntryFromBundle(
  data: InvestigationBundle,
  sourceFileLabel?: string,
): RecentInvestigation {
  return recentEntryFromParts(data.detail, data.report, data.findings, sourceFileLabel);
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
    const enriched = recentEntryFromParts(
      detail,
      report,
      findings,
      entry.sourceFile || entry.name,
    );
    return {
      ...enriched,
      createdAt: entry.createdAt,
      sourceFile: entry.sourceFile ?? enriched.sourceFile,
    };
  } catch {
    return normalizeEntry(entry);
  }
}

export function loadRecentInvestigations(
  limit: number = SIDEBAR_HISTORY_MAX,
): RecentInvestigation[] {
  const raw = loadRawRecentInvestigations();
  const prepared = prepareInvestigationList(raw, SIDEBAR_HISTORY_MAX);
  if (JSON.stringify(prepared) !== JSON.stringify(raw)) {
    persistInvestigationList(prepared);
  }
  return prepared.slice(0, limit);
}

function toIsoDate(value: string | Date | undefined): string {
  if (!value) return new Date().toISOString();
  if (typeof value === "string") return value;
  return value.toISOString();
}

function listItemToRecent(
  row: Awaited<ReturnType<typeof listInvestigations>>[number],
  local?: RecentInvestigation,
): RecentInvestigation {
  const createdAt = toIsoDate(row.updated_at || row.created_at);
  const sourceFile = row.source_filename || local?.sourceFile;
  return normalizeEntry({
    ...local,
    id: row.id,
    title: local?.title,
    summary: row.summary || local?.summary,
    risk:
      local?.risk ||
      displayRiskLevel({
        riskScore: row.attack_surface_score,
        criticalCount: row.critical_count,
      }),
    createdAt,
    updatedAt: createdAt,
    sourceFile,
    pathCount: row.path_count,
    findingsCount: row.findings_retained,
    durationSeconds: row.duration_seconds,
    riskScore: row.attack_surface_score,
    criticalCount: row.critical_count,
    surfaceClassification: row.attack_surface_classification,
    avgConfidence: row.avg_confidence,
    name: local?.title,
    headline: row.summary || local?.summary,
  });
}

/** Replace local cache with deduplicated backend investigations when API is reachable. */
export async function syncRecentInvestigationsFromApi(
  limit: number = SIDEBAR_HISTORY_MAX,
): Promise<RecentInvestigation[]> {
  if (typeof window === "undefined") return [];

  try {
    const rows = await listInvestigations();
    if (!rows.length) return loadRecentInvestigations(limit);

    const localById = new Map(loadRawRecentInvestigations().map((item) => [item.id, item]));
    const merged: RecentInvestigation[] = [];

    for (const row of rows.slice(0, SIDEBAR_HISTORY_MAX)) {
      const local = localById.get(row.id);
      const base = listItemToRecent(row, local);
      const needsEnrich =
        !base.title ||
        looksLikeFilename(base.title) ||
        !base.findingsHash ||
        !base.summary;

      if (needsEnrich) {
        merged.push(await enrichRecentInvestigation(base));
      } else {
        merged.push(base);
      }
    }

    const prepared = prepareInvestigationList(merged, SIDEBAR_HISTORY_MAX);
    persistInvestigationList(prepared);
    notifyRecentUpdated();
    return prepared.slice(0, limit);
  } catch {
    return loadRecentInvestigations(limit);
  }
}

export function saveRecentInvestigation(
  entry: RecentInvestigation,
  options?: { preserveTimestamp?: boolean },
) {
  if (typeof window === "undefined") return;

  const now = new Date().toISOString();
  const normalized = normalizeEntry(entry);
  const sourceKey = normalized.sourceFile
    ? normalizeSourceFilename(normalized.sourceFile)
    : null;

  const incoming: RecentInvestigation = {
    ...normalized,
    createdAt: options?.preserveTimestamp ? normalized.createdAt : now,
    updatedAt: now,
  };

  const list = loadRawRecentInvestigations().filter((item) => {
    const row = normalizeEntry(item);

    if (row.id === incoming.id) return false;

    if (incoming.findingsHash && row.findingsHash === incoming.findingsHash) {
      return false;
    }

    const incomingSignature = contentSignature(incoming);
    const rowSignature = contentSignature(row);
    if (incomingSignature && rowSignature === incomingSignature) {
      return false;
    }

    if (
      sourceKey &&
      incoming.findingsHash &&
      row.sourceFile &&
      normalizeSourceFilename(row.sourceFile) === sourceKey &&
      row.findingsHash === incoming.findingsHash
    ) {
      return false;
    }

    return true;
  });

  const next = prepareInvestigationList([incoming, ...list]);
  persistInvestigationList(next);
  notifyRecentUpdated();
}

export function groupInvestigationsByDate(
  items: RecentInvestigation[],
): Record<InvestigationDateGroup, RecentInvestigation[]> {
  const groups: Record<InvestigationDateGroup, RecentInvestigation[]> = {
    today: [],
    yesterday: [],
    older: [],
  };

  for (const item of items) {
    groups[getInvestigationDateGroup(item.createdAt)].push(normalizeEntry(item));
  }

  return groups;
}

const SIDEBAR_GROUP_ORDER: SidebarHistoryGroup[] = [
  "today",
  "yesterday",
  "last_week",
  "older",
];

export const SIDEBAR_GROUP_LABELS: Record<SidebarHistoryGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_week: "Last week",
  older: "Older",
};

export function groupInvestigationsForSidebar(
  items: RecentInvestigation[],
): Array<{ key: SidebarHistoryGroup; label: string; items: RecentInvestigation[] }> {
  const groups: Record<SidebarHistoryGroup, RecentInvestigation[]> = {
    today: [],
    yesterday: [],
    last_week: [],
    older: [],
  };

  for (const item of items) {
    const normalized = normalizeEntry(item);
    groups[getSidebarHistoryGroup(historyTimestamp(normalized))].push(normalized);
  }

  return SIDEBAR_GROUP_ORDER.filter((key) => groups[key].length > 0).map((key) => ({
    key,
    label: SIDEBAR_GROUP_LABELS[key],
    items: groups[key],
  }));
}

export { extractSourceFile };
