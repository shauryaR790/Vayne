export interface RecentInvestigation {
  id: string;
  name: string;
  createdAt: string;
  pathCount?: number;
}

const STORAGE_KEY = "vayne-recent-investigations";
const MAX = 8;

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
