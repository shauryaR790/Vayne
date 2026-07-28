import { getInvestigation } from "./api";
import type { InvestigationBundle } from "./investigation-bundle";
import {
  buildInvestigationCardMetaFromBundle,
  extractSourceFile,
} from "./investigation-metadata";
import { formatDisplayInvestigationId } from "./investigation-record";
import type { MessageAttachment } from "./multi-investigation-message";
import { fileTypeLabel } from "./upload";
import {
  loadConversationSession,
  type StoredChatMessage,
  serializeMessages,
} from "./conversation-session";

export type { StoredChatMessage as ChatMessage };

export interface InvestigationSession {
  id: string;
  title: string;
  createdAt: number;
  files: MessageAttachment[];
  prompt: string;
  messages: StoredChatMessage[];
  analystMessages?: StoredChatMessage[];
  investigationGroupId?: string | null;
  investigationIds?: string[];
  investigationMode?: "combined" | "separate";
  scrollTop: number;
  analystScrollTop?: number;
  inputDraft: string;
  analystInputDraft?: string;
  updatedAt: number;
  /** Cached Engine Trace so refresh/resume does not depend only on the API file. */
  engineTraceEvents?: Record<string, unknown>[];
  /** Engine snapshots are loaded from the API at render time; optional cache slot. */
  executiveSummary?: Record<string, unknown>;
  attackPaths?: Record<string, unknown>[];
  graph?: Record<string, unknown>;
  findings?: Record<string, unknown>[];
  evidence?: Record<string, unknown>[];
  reports?: Record<string, unknown>[];
}

const SESSIONS_INDEX_KEY = "vayne-investigation-sessions";
const ACTIVE_INVESTIGATION_KEY = "vayne-active-investigation-id";

export const INVESTIGATION_SESSIONS_STORAGE_KEY = SESSIONS_INDEX_KEY;
export const ACTIVE_INVESTIGATION_STORAGE_KEY = ACTIVE_INVESTIGATION_KEY;
export const INVESTIGATION_LOADED_EVENT = "vayne:investigation-loaded";

function loadSessionIndex(): Record<string, InvestigationSession> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SESSIONS_INDEX_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, InvestigationSession>;
  } catch {
    return {};
  }
}

function persistSessionIndex(index: Record<string, InvestigationSession>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(index));
}

export function getActiveInvestigationId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_INVESTIGATION_KEY);
}

export function setActiveInvestigationId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(ACTIVE_INVESTIGATION_KEY, id);
  else localStorage.removeItem(ACTIVE_INVESTIGATION_KEY);
}

export function loadInvestigationSession(sessionId: string): InvestigationSession | null {
  const index = loadSessionIndex();
  return index[sessionId] ?? null;
}

const TRACE_CACHE_PREFIX = "vayne-engine-trace-cache:";

export function saveInvestigationSession(session: InvestigationSession) {
  const index = loadSessionIndex();
  const prev = index[session.id];
  // Never drop a previously cached Engine Trace when a later persist omits it.
  const engineTraceEvents =
    session.engineTraceEvents?.length
      ? session.engineTraceEvents
      : prev?.engineTraceEvents;
  // Keep the sessions index slim (no proof dump); full Trace lives in the dedicated cache key.
  const sessionTrace = engineTraceEvents?.length
    ? slimTraceForCache(engineTraceEvents)
    : undefined;
  index[session.id] = {
    ...session,
    ...(sessionTrace?.length ? { engineTraceEvents: sessionTrace } : {}),
    updatedAt: Date.now(),
  };
  persistSessionIndex(index);
  setActiveInvestigationId(session.id);
  if (engineTraceEvents?.length) {
    writeEngineTraceCache(session.id, engineTraceEvents);
  }
}

function slimTraceForCache(events: Record<string, unknown>[]): Record<string, unknown>[] {
  // Drop verbose proof dump lines first — Attention Queue + stage telemetry still restore.
  return events.filter((ev) => !(ev.stage === "proof" && ev.event === "line"));
}

function writeEngineTraceCache(sessionId: string, events: Record<string, unknown>[]) {
  if (typeof window === "undefined" || !sessionId || !events.length) return;
  try {
    window.localStorage.setItem(`${TRACE_CACHE_PREFIX}${sessionId}`, JSON.stringify(events));
  } catch {
    try {
      window.localStorage.setItem(
        `${TRACE_CACHE_PREFIX}${sessionId}`,
        JSON.stringify(slimTraceForCache(events)),
      );
    } catch {
      /* quota */
    }
  }
}

function removeEngineTraceCache(sessionId: string) {
  if (typeof window === "undefined" || !sessionId) return;
  window.localStorage.removeItem(`${TRACE_CACHE_PREFIX}${sessionId}`);
}

function clearAllEngineTraceCaches() {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(TRACE_CACHE_PREFIX)) keys.push(key);
  }
  for (const key of keys) window.localStorage.removeItem(key);
}

export function patchInvestigationSessionTrace(
  sessionId: string,
  events: Record<string, unknown>[],
) {
  if (!sessionId || !events.length) return;
  writeEngineTraceCache(sessionId, events);
  const index = loadSessionIndex();
  const existing = index[sessionId];
  if (!existing) return;
  const sessionTrace = slimTraceForCache(events);
  index[sessionId] = {
    ...existing,
    ...(sessionTrace.length ? { engineTraceEvents: sessionTrace } : {}),
    updatedAt: Date.now(),
  };
  persistSessionIndex(index);
}

export function loadCachedEngineTrace(sessionId: string): Record<string, unknown>[] {
  if (typeof window === "undefined" || !sessionId) return [];
  try {
    const raw = window.localStorage.getItem(`${TRACE_CACHE_PREFIX}${sessionId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

export function deleteInvestigationSession(sessionId: string) {
  const index = loadSessionIndex();
  delete index[sessionId];
  persistSessionIndex(index);
  removeEngineTraceCache(sessionId);
  if (getActiveInvestigationId() === sessionId) {
    setActiveInvestigationId(null);
  }
}

export function clearAllInvestigationSessions() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSIONS_INDEX_KEY);
  localStorage.removeItem(ACTIVE_INVESTIGATION_KEY);
  clearAllEngineTraceCaches();
}

export function findSessionForInvestigation(investigationId: string): InvestigationSession | null {
  const index = loadSessionIndex();
  if (index[investigationId]) return index[investigationId];

  for (const session of Object.values(index)) {
    if (session.investigationIds?.includes(investigationId)) return session;
  }
  return null;
}

export function sessionStorageKeyFromState(input: {
  investigationId?: string | null;
  investigationGroupId?: string | null;
  investigationIds?: string[];
}): string | null {
  return input.investigationGroupId ?? input.investigationId ?? input.investigationIds?.[0] ?? null;
}

function attachmentsFromSourceNames(names: string[]): MessageAttachment[] {
  return names.map((name) => ({
    id: `${name}:0:0`,
    name,
    type: fileTypeLabel(name),
    size: 0,
  }));
}

function inferFilesFromMessages(messages: StoredChatMessage[]): MessageAttachment[] {
  const userWithAttachments = messages.find((m) => m.role === "user" && m.attachments?.length);
  if (userWithAttachments?.attachments?.length) {
    return userWithAttachments.attachments;
  }

  const labels = new Set<string>();
  for (const message of messages) {
    if (message.sourceLabel) labels.add(message.sourceLabel);
    message.investigationSources?.forEach((source) => {
      if (source.sourceLabel) labels.add(source.sourceLabel);
    });
  }
  return attachmentsFromSourceNames([...labels]);
}

function inferPrompt(messages: StoredChatMessage[], fallback: string): string {
  const userMessage = messages.find((m) => m.role === "user");
  return userMessage?.content?.trim() || fallback;
}

export function buildInvestigationSessionFromBundle(
  bundle: InvestigationBundle,
  options: {
    messages: StoredChatMessage[];
    analystMessages?: StoredChatMessage[];
    investigationGroupId?: string | null;
    investigationIds?: string[];
    investigationMode?: "combined" | "separate";
    scrollTop?: number;
    analystScrollTop?: number;
    inputDraft?: string;
    analystInputDraft?: string;
    sessionId?: string;
    engineTraceEvents?: Record<string, unknown>[];
  },
): InvestigationSession {
  const meta = buildInvestigationCardMetaFromBundle(bundle);
  const sourceName =
    meta.sourceFile ||
    bundle.report.target?.split(/[/\\]/).pop() ||
    extractSourceFile(undefined, bundle.report) ||
    "evidence";
  const messages = serializeMessages(options.messages);
  const files = inferFilesFromMessages(messages);
  const prompt = inferPrompt(messages, `Analyze ${sourceName}`);
  const invId = bundle.detail.summary.id;

  return {
    id: options.sessionId ?? options.investigationGroupId ?? invId,
    title: meta.title,
    createdAt: new Date(bundle.detail.summary.created_at).getTime() || Date.now(),
    files: files.length ? files : attachmentsFromSourceNames([sourceName]),
    prompt,
    messages,
    analystMessages: serializeMessages(options.analystMessages ?? []),
    investigationGroupId: options.investigationGroupId ?? null,
    investigationIds: options.investigationIds ?? [invId],
    investigationMode: options.investigationMode,
    scrollTop: options.scrollTop ?? 0,
    analystScrollTop: options.analystScrollTop ?? 0,
    inputDraft: options.inputDraft ?? "",
    analystInputDraft: options.analystInputDraft ?? "",
    updatedAt: Date.now(),
    ...(options.engineTraceEvents?.length
      ? { engineTraceEvents: options.engineTraceEvents }
      : {}),
  };
}

export async function rebuildInvestigationSession(
  investigationId: string,
): Promise<InvestigationSession> {
  const detail = await getInvestigation(investigationId);
  const sourceName = detail.summary.name?.trim() || investigationId;
  const prompt = `Analyze ${sourceName}`;
  const files = attachmentsFromSourceNames([sourceName]);
  const messages: StoredChatMessage[] = [
    {
      id: `user-${investigationId}`,
      role: "user",
      content: prompt,
      attachments: files,
    },
    {
      id: `inv-${investigationId}`,
      role: "assistant",
      content: "",
      kind: "investigation",
      investigationId,
      sourceLabel: sourceName,
    },
  ];

  return {
    id: investigationId,
    title: sourceName,
    createdAt: new Date(detail.summary.created_at).getTime() || Date.now(),
    files,
    prompt,
    messages,
    analystMessages: [],
    investigationGroupId: null,
    investigationIds: [investigationId],
    scrollTop: 0,
    analystScrollTop: 0,
    inputDraft: "",
    analystInputDraft: "",
    updatedAt: Date.now(),
  };
}

export function migrateLegacyConversationSession(): void {
  const legacy = loadConversationSession();
  if (!legacy?.investigationId || !legacy.messages?.length) return;

  const sessionId = legacy.investigationGroupId ?? legacy.investigationId;
  if (loadInvestigationSession(sessionId)) return;

  const files = inferFilesFromMessages(legacy.messages);
  const prompt = inferPrompt(legacy.messages, "");

  saveInvestigationSession({
    id: sessionId,
    title: "Security Investigation",
    createdAt: Date.now(),
    files,
    prompt,
    messages: serializeMessages(legacy.messages),
    investigationGroupId: legacy.investigationGroupId ?? null,
    investigationIds: legacy.investigationIds ?? [legacy.investigationId],
    investigationMode: legacy.investigationMode,
    scrollTop: legacy.scrollTop ?? 0,
    inputDraft: legacy.inputDraft ?? "",
    updatedAt: Date.now(),
  });
}

export function investigationDisplayId(session: InvestigationSession, sequenceIndex = 1): string {
  const iso = new Date(session.createdAt).toISOString();
  return formatDisplayInvestigationId(iso, sequenceIndex);
}

export function notifyInvestigationLoaded(sessionId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(INVESTIGATION_LOADED_EVENT, { detail: { sessionId } }),
  );
}
