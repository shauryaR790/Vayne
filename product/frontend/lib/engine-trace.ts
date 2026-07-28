/** Engine Trace — live structured events from the deterministic investigation engine. */

import { getApiBase, requestHeaders, type AnalyzeSuccess } from "./api";

export type EngineTraceEvent = {
  id?: string;
  stage: string;
  event: string;
  timestamp_ms?: number;
  execution_ms?: number;
  message?: string;
  fields?: Record<string, unknown>;
  formula?: {
    name?: string;
    result?: number;
    result_pct?: number;
    expression?: string;
    weights?: Record<string, number>;
    contributions?: Array<Record<string, unknown>>;
    sum_deltas?: number;
  };
};

export type EngineTraceStreamEvent =
  | { type: "engine_event"; event: EngineTraceEvent }
  | { type: "complete"; result: AnalyzeSuccess; elapsed_ms?: number }
  | { type: "error"; message: string };

function parseSseChunk(buffer: string): { events: EngineTraceStreamEvent[]; rest: string } {
  const events: EngineTraceStreamEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    for (const line of part.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        events.push(JSON.parse(line.slice(6)) as EngineTraceStreamEvent);
      } catch {
        /* ignore */
      }
    }
  }
  return { events, rest };
}

export async function* streamAnalyzeWithTrace(
  files: FileList | File[],
  name: string,
  options?: { mode?: "combined" | "separate"; prompt?: string; signal?: AbortSignal },
): AsyncGenerator<EngineTraceStreamEvent> {
  const form = new FormData();
  form.append("name", name);
  if (options?.prompt) form.append("prompt", options.prompt);
  if (options?.mode) form.append("mode", options.mode);
  for (const file of Array.from(files)) {
    form.append("files", file, file.name);
  }

  const res = await fetch(`${getApiBase()}/api/analyze/stream`, {
    method: "POST",
    headers: requestHeaders(),
    body: form,
    signal: options?.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    yield { type: "error", message: text || res.statusText || "Analysis failed" };
    return;
  }
  if (!res.body) {
    yield { type: "error", message: "Empty response body" };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseChunk(buffer);
    buffer = parsed.rest;
    for (const event of parsed.events) yield event;
  }
  if (buffer.trim()) {
    const parsed = parseSseChunk(`${buffer}\n\n`);
    for (const event of parsed.events) yield event;
  }
}

export async function fetchEngineTrace(investigationId: string): Promise<EngineTraceEvent[]> {
  const res = await fetch(`${getApiBase()}/api/investigation/${investigationId}/engine-trace`, {
    cache: "no-store",
    headers: requestHeaders(),
  });
  if (!res.ok) return [];
  const body = await res.json();
  if (Array.isArray(body)) return body as EngineTraceEvent[];
  if (body && typeof body === "object" && Array.isArray((body as { events?: unknown }).events)) {
    return (body as { events: EngineTraceEvent[] }).events;
  }
  return [];
}

export const STAGE_LABELS: Record<string, string> = {
  parser: "Parser",
  normalization: "Normalization",
  deduplication: "Deduplicator",
  correlation: "Correlation",
  validation: "Validation",
  confidence: "Confidence Engine",
  attack_graph: "Attack Graph Builder",
  priority: "Priority Engine",
  investigation: "Investigation Generator",
  risk: "Risk Engine",
  export: "Export",
  summary: "Engine Summary",
  ai_explanation: "AI Explanation",
  console: "Engine Console",
  proof: "Proof Mode",
};
