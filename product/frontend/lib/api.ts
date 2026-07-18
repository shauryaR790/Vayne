/** Centralized API client — all backend calls go through here. */

import type {
  FindingsData,
  GraphData,
  InvestigationDetail,
  InvestigationListItem,
  InvestigationReport,
  PathDetail,
  RemediationData,
  WorkbenchData,
} from "./types";

const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function normalizeApiBase(raw?: string): string {
  const fallback =
    typeof window !== "undefined"
      ? `http://${window.location.hostname}:8000`
      : "http://127.0.0.1:8000";
  if (!raw?.trim()) return fallback;

  let url = raw.trim().replace(/\/$/, "");
  if (url.startsWith("//")) url = `http:${url}`;
  else if (!/^https?:\/\//i.test(url)) url = `http://${url}`;

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && LOCAL_DEV_HOSTS.has(parsed.hostname)) {
      parsed.protocol = "http:";
    }
    return parsed.origin;
  } catch {
    return fallback;
  }
}

/** Resolve API origin — always match browser hostname in local dev. */
export function getApiBase(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (LOCAL_DEV_HOSTS.has(host)) {
      return `http://${host}:8000`;
    }
  }
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured?.trim()) {
    return normalizeApiBase(configured);
  }
  return "http://127.0.0.1:8000";
}

/** Use getApiBase() in client code — this snapshot is SSR-only. */
export const API_BASE =
  typeof window !== "undefined" ? getApiBase() : "http://localhost:8000";

function apiUrl(path: string): string {
  return `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Turn FastAPI / fetch error bodies into short user-facing text. */
export function parseApiError(status: number, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return `Request failed (${status})`;

  try {
    const parsed = JSON.parse(trimmed) as {
      detail?: string | Array<{ msg?: string }>;
      error?: string;
      message?: string;
    };

    const detail = parsed.detail;
    if (typeof detail === "string") {
      if (detail === "Investigation not found") {
        return "This investigation no longer exists on the server.";
      }
      if (detail === "Report not found") {
        return "This investigation's report is unavailable. Re-run the analysis to regenerate it.";
      }
      return detail;
    }

    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail.find((item) => item?.msg)?.msg;
      if (first) return first;
    }

    if (parsed.error?.trim()) return parsed.error.trim();
    if (parsed.message?.trim()) return parsed.message.trim();
  } catch {
    // fall through
  }

  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}…` : trimmed;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(parseApiError(res.status, await res.text()));
  return res.json() as Promise<T>;
}

async function fetchText(path: string): Promise<string> {
  const res = await fetch(apiUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(parseApiError(res.status, await res.text()));
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

/** Distinct failure categories so the UI can show a precise message. */
export type AnalyzeErrorKind =
  | "offline" // fetch itself failed — backend truly unreachable
  | "timeout" // request exceeded the client timeout
  | "unsupported_file"
  | "invalid_xml"
  | "invalid_json"
  | "parser_error"
  | "internal_error"
  | "unknown";

export class AnalyzeError extends Error {
  kind: AnalyzeErrorKind;
  status?: number;
  stage?: string;
  file?: string;
  details?: string;

  constructor(
    kind: AnalyzeErrorKind,
    message: string,
    extra?: { status?: number; stage?: string; file?: string; details?: string },
  ) {
    super(message);
    this.name = "AnalyzeError";
    this.kind = kind;
    this.status = extra?.status;
    this.stage = extra?.stage;
    this.file = extra?.file;
    this.details = extra?.details;
  }
}

type AnalyzeBackendError = {
  error?: string;
  error_kind?: string;
  stage?: string;
  file?: string;
  details?: string;
  detail?: string;
};

export type AnalyzeSuccess = {
  investigation_id: string;
  status: string;
  mode: "combined" | "separate";
  investigation_group_id?: string | null;
  investigations: Array<{
    investigation_id: string;
    source_filename: string;
    status: string;
  }>;
  files_processed?: number;
  files_skipped?: number;
  warnings?: string[];
  skipped?: Array<{ file: string; stage: string; error: string; error_kind: string }>;
};

/** Client-side ceiling for a single analysis request. */
const ANALYZE_TIMEOUT_MS = 300_000;

function kindFromStatus(status: number, backendKind?: string): AnalyzeErrorKind {
  switch (backendKind) {
    case "unsupported_file":
    case "invalid_xml":
    case "invalid_json":
    case "parser_error":
    case "internal_error":
      return backendKind;
    default:
      break;
  }
  if (status === 422 || status === 415) return "unsupported_file";
  if (status >= 500) return "internal_error";
  return "unknown";
}

export async function analyzeFiles(
  files: FileList | File[],
  name: string,
  options?: { mode?: "combined" | "separate"; prompt?: string },
): Promise<AnalyzeSuccess> {
  const endpoint = apiUrl("/api/analyze");
  const fileList = Array.from(files);
  for (const f of fileList) {
    console.log({ filename: f.name, size: f.size, type: f.type, endpoint });
  }
  const form = new FormData();
  form.append("name", name);
  if (options?.prompt) form.append("prompt", options.prompt);
  if (options?.mode) form.append("mode", options.mode);
  fileList.forEach((f) => form.append("files", f));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    // AbortError => our own timeout. Anything else here is a real network
    // failure (backend truly unreachable) — the ONLY case that may say so.
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AnalyzeError("timeout", "Analysis exceeded timeout.");
    }
    throw new AnalyzeError(
      "offline",
      `Cannot reach VANE API at ${getApiBase()}. Start the backend: python -m uvicorn product.backend.main:app --reload --port 8000`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let body: AnalyzeBackendError = {};
    let rawText = "";
    try {
      rawText = await res.text();
      body = rawText ? (JSON.parse(rawText) as AnalyzeBackendError) : {};
    } catch {
      body = { error: rawText };
    }
    const kind = kindFromStatus(res.status, body.error_kind);
    const message =
      body.error || body.detail || rawText || `Analysis failed (${res.status})`;
    throw new AnalyzeError(kind, message, {
      status: res.status,
      stage: body.stage,
      file: body.file,
      details: body.details,
    });
  }

  return res.json() as Promise<AnalyzeSuccess>;
}

export async function getInvestigation(id: string): Promise<InvestigationDetail> {
  return fetchJson(`/api/investigation/${id}`);
}

export async function listInvestigations(): Promise<InvestigationListItem[]> {
  const data = await fetchJson<{ investigations: InvestigationListItem[] }>("/api/investigations");
  return data.investigations;
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

export async function getWorkbench(id: string): Promise<WorkbenchData> {
  return fetchJson(`/api/investigation/${id}/workbench`);
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

export async function resetWorkspace(): Promise<{
  status: string;
  investigations_deleted: number;
  storage_dirs_removed: number;
  storage_files_removed: number;
}> {
  const res = await fetch(apiUrl("/api/dev/reset-workspace"), { method: "POST" });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Workspace reset failed (${res.status})`);
  }
  return res.json();
}
