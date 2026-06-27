/** Centralized API client — all backend calls go through here. */

import type {
  FindingsData,
  GraphData,
  InvestigationDetail,
  InvestigationReport,
  PathDetail,
  RemediationData,
} from "./types";

const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function normalizeApiBase(raw?: string): string {
  const fallback = "http://127.0.0.1:8000";
  if (!raw?.trim()) return fallback;

  let url = raw.trim().replace(/\/$/, "");
  if (url.startsWith("//")) url = `http:${url}`;
  else if (!/^https?:\/\//i.test(url)) url = `http://${url}`;

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && LOCAL_DEV_HOSTS.has(parsed.hostname)) {
      parsed.protocol = "http:";
      if (parsed.hostname === "localhost") parsed.hostname = "127.0.0.1";
      url = parsed.origin;
    }
    return parsed.origin;
  } catch {
    return fallback;
  }
}

export const API_BASE =
  normalizeApiBase(process.env.NEXT_PUBLIC_API_URL) ?? "http://127.0.0.1:8000";

function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function fetchText(path: string): Promise<string> {
  const res = await fetch(apiUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.text();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(apiUrl("/api/health"), { cache: "no-store" });
    if (!res.ok) return false;
    const body = (await res.json()) as { status?: string };
    return body.status === "ok";
  } catch {
    return false;
  }
}

export async function analyzeFiles(files: FileList | File[], name: string) {
  const endpoint = apiUrl("/api/analyze");
  const fileList = Array.from(files);
  for (const f of fileList) {
    console.log({ filename: f.name, size: f.size, type: f.type, endpoint });
  }
  const form = new FormData();
  form.append("name", name);
  fileList.forEach((f) => form.append("files", f));
  const res = await fetch(endpoint, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ investigation_id: string; status: string }>;
}

export async function getInvestigation(id: string): Promise<InvestigationDetail> {
  return fetchJson(`/api/investigation/${id}`);
}

export async function getReport(id: string): Promise<InvestigationReport> {
  return fetchJson(`/api/investigation/${id}/report`);
}

export async function getPath(id: string): Promise<PathDetail> {
  return fetchJson(`/api/path/${id}`);
}

export async function getGraph(id: string): Promise<GraphData> {
  return fetchJson(`/api/investigation/${id}/graph`);
}

export async function getFindings(id: string): Promise<FindingsData> {
  return fetchJson(`/api/investigation/${id}/findings`);
}

export async function getRemediation(id: string): Promise<RemediationData> {
  return fetchJson(`/api/investigation/${id}/remediation`);
}

export async function getProof(id: string): Promise<string> {
  return fetchText(`/api/investigation/${id}/proof`);
}

export async function getReportMarkdown(
  id: string,
  type: "executive" | "analyst" | "attack_story" | "remediation",
): Promise<string> {
  return fetchText(`/api/investigation/${id}/reports/${type}`);
}
