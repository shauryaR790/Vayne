/** Ask VAYNE — streaming chat client (OpenAI GPT analyst). */

import { getApiBase } from "./api";
import { workspaceHeaders } from "./workspace-id";
import type { ChatTurn } from "./vayne-analyst";

export type AnalystStreamEvent =
  | { type: "thinking"; message: string }
  | { type: "token"; token: string }
  | { type: "done"; cached?: boolean }
  | {
      type: "usage";
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      cost_usd: number;
      cached?: boolean;
    }
  | { type: "error"; code: string; message: string };

export type AnalystStatus = {
  provider: string;
  model: string;
  online: boolean;
  configured?: boolean;
};

export type ReportMode = "executive" | "technical" | "remediation" | "audit";

export const ANALYST_OFFLINE_MESSAGE =
  "**Analyst offline**\n\n- VAYNE LLM is unavailable right now.\n- Deterministic investigation results in the workbench remain available.";

export const ANALYST_PRESETS: Array<{
  id: string;
  label: string;
  prompt: string;
  reportMode?: ReportMode;
}> = [
  {
    id: "finding",
    label: "Explain Finding",
    prompt: "Explain the most significant validated finding and cite evidence from the investigation.",
  },
  {
    id: "attack_chain",
    label: "Explain Attack Chain",
    prompt: "Explain the validated attack chain step by step.",
  },
  {
    id: "rejected_chain",
    label: "Explain Rejected Chain",
    prompt: "Explain why attack paths were rejected and what evidence was missing.",
  },
  {
    id: "graph",
    label: "Explain Graph",
    prompt: "Explain the attack graph — key nodes, edges, and how they connect.",
  },
  {
    id: "why_rejected",
    label: "Why Rejected?",
    prompt: "Why was the top rejected attack path rejected?",
  },
  {
    id: "evidence",
    label: "What Evidence?",
    prompt: "What evidence supports the top validated finding and attack path?",
  },
  {
    id: "root_cause",
    label: "Root Cause",
    prompt: "What is the root cause of the primary validated finding?",
  },
  {
    id: "technical",
    label: "Technical Summary",
    prompt: "Give me a technical summary for SOC and pentest teams.",
    reportMode: "technical",
  },
  {
    id: "executive",
    label: "Executive Summary",
    prompt: "Give me an executive summary for leadership.",
    reportMode: "executive",
  },
  {
    id: "remediation",
    label: "Remediation Plan",
    prompt: "What should we patch and fix first? Give a prioritized remediation plan.",
    reportMode: "remediation",
  },
  {
    id: "business",
    label: "Business Impact",
    prompt: "What is the business impact if the validated attack path is exploited?",
  },
  {
    id: "next",
    label: "What Next?",
    prompt: "What should I do next based on this investigation?",
  },
  {
    id: "time_saved",
    label: "Time Saved",
    prompt: "How much analyst time did this automated investigation likely save?",
  },
];

export const ANALYST_THINKING_MESSAGES = [
  "Analyzing evidence...",
  "Correlating findings...",
  "Constructing analyst response...",
];

function parseSseChunk(buffer: string): { events: AnalystStreamEvent[]; rest: string } {
  const events: AnalystStreamEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";

  for (const part of parts) {
    for (const line of part.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        events.push(JSON.parse(line.slice(6)) as AnalystStreamEvent);
      } catch {
        /* ignore malformed */
      }
    }
  }
  return { events, rest };
}

async function* readSseStream(
  res: Response,
): AsyncGenerator<AnalystStreamEvent> {
  if (!res.body) {
    yield { type: "error", code: "no_body", message: "Empty response body" };
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
    for (const event of parsed.events) {
      yield event;
    }
  }

  if (buffer.trim()) {
    const parsed = parseSseChunk(`${buffer}\n\n`);
    for (const event of parsed.events) yield event;
  }
}

export async function fetchAnalystStatus(): Promise<AnalystStatus | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/analyst/status`, {
      cache: "no-store",
      headers: workspaceHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as AnalystStatus;
  } catch {
    return null;
  }
}

/** Strip empty / structured investigation turns — backend requires min_length=1 per turn. */
export function sanitizeChatHistory(
  messages: Array<{
    role: string;
    content: string;
    streaming?: boolean;
    kind?: string;
  }>,
): ChatTurn[] {
  return messages
    .filter((m) => !m.streaming)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.kind !== "investigation" && m.kind !== "multi-investigation")
    .map(({ role, content }) => ({ role: role as ChatTurn["role"], content: content.trim() }))
    .filter((m) => m.content.length > 0);
}

export async function* streamAnalystChat(
  investigationId: string,
  message: string,
  history: ChatTurn[],
  options?: {
    reportMode?: ReportMode;
    presetId?: string;
    signal?: AbortSignal;
  },
): AsyncGenerator<AnalystStreamEvent> {
  const url = `${getApiBase()}/api/investigation/${investigationId}/chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: workspaceHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      message,
      history: history
        .map((turn) => ({ role: turn.role, content: turn.content.trim() }))
        .filter((turn) => turn.content.length > 0),
      report_mode: options?.reportMode ?? null,
      preset_id: options?.presetId ?? null,
    }),
    signal: options?.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    yield { type: "error", code: "http_error", message: text || res.statusText };
    return;
  }

  yield* readSseStream(res);
}

/** General Ask VAYNE chat with no investigation loaded (empty workspace). */
export async function* streamGeneralChat(
  message: string,
  history: ChatTurn[],
  options?: {
    reportMode?: ReportMode;
    presetId?: string;
    signal?: AbortSignal;
  },
): AsyncGenerator<AnalystStreamEvent> {
  const url = `${getApiBase()}/api/chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: workspaceHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      message,
      history: history
        .map((turn) => ({ role: turn.role, content: turn.content.trim() }))
        .filter((turn) => turn.content.length > 0),
      report_mode: options?.reportMode ?? null,
      preset_id: options?.presetId ?? null,
    }),
    signal: options?.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    yield { type: "error", code: "http_error", message: text || res.statusText };
    return;
  }

  yield* readSseStream(res);
}

export async function* streamInvestigationBrief(
  investigationId: string,
  options?: { signal?: AbortSignal },
): AsyncGenerator<AnalystStreamEvent> {
  const url = `${getApiBase()}/api/investigation/${investigationId}/brief`;
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: workspaceHeaders(),
    signal: options?.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    yield { type: "error", code: "http_error", message: text || res.statusText };
    return;
  }

  yield* readSseStream(res);
}
