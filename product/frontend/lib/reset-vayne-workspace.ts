/**
 * VAYNE workspace reset — developer utility.
 *
 * Persistence layers cleared:
 * - localStorage: vayne-active-conversation, vayne-recent-investigations, any vayne-* keys
 * - sessionStorage: any vayne-* keys
 * - IndexedDB: databases whose name contains "vayne"
 * - Cache API: named caches containing "vayne"
 * - Backend SQLite/Postgres: investigations, findings, attack_paths, graph_nodes, graph_edges
 * - Backend file storage: product/storage/investigations/* (exports, graphs, reports, analyst cache)
 *
 * Not used by VAYNE product today: Zustand persist, Redux persist, Supabase, session-only cookies.
 * In-memory React state is cleared via hard reload after reset.
 */

import { resetWorkspace } from "./api";
import {
  clearConversationSession,
  CONVERSATION_SESSION_STORAGE_KEY,
  NEW_CHAT_EVENT,
} from "./conversation-session";
import {
  clearAllInvestigationSessions,
  ACTIVE_INVESTIGATION_STORAGE_KEY,
  INVESTIGATION_SESSIONS_STORAGE_KEY,
} from "./investigation-session";
import {
  clearRecentInvestigations,
  RECENT_INVESTIGATIONS_STORAGE_KEY,
  RECENT_INVESTIGATIONS_UPDATED,
} from "./recent-investigations";

const LOG_PREFIX = "[VAYNE RESET]";

export interface ResetVayneWorkspaceResult {
  backend: {
    investigations_deleted: number;
    storage_dirs_removed: number;
    storage_files_removed: number;
  };
}

function logStep(message: string) {
  console.log(`✓ ${message}`);
}

function clearVayneStorageKeys(storage: Storage) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key) keys.push(key);
  }
  for (const key of keys) {
    if (key === CONVERSATION_SESSION_STORAGE_KEY || key === RECENT_INVESTIGATIONS_STORAGE_KEY) {
      storage.removeItem(key);
      continue;
    }
    if (
      key === INVESTIGATION_SESSIONS_STORAGE_KEY ||
      key === ACTIVE_INVESTIGATION_STORAGE_KEY
    ) {
      storage.removeItem(key);
      continue;
    }
    if (key.toLowerCase().startsWith("vayne")) {
      storage.removeItem(key);
    }
  }
}

async function clearVayneIndexedDb() {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return;

  const databases = await indexedDB.databases();
  await Promise.all(
    databases
      .filter((db) => db.name?.toLowerCase().includes("vayne"))
      .map(
        (db) =>
          new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(db.name!);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => resolve();
          }),
      ),
  );
}

async function clearVayneCaches() {
  if (typeof caches === "undefined") return;

  const names = await caches.keys();
  await Promise.all(
    names.filter((name) => name.toLowerCase().includes("vayne")).map((name) => caches.delete(name)),
  );
}

function notifyWorkspaceCleared() {
  window.dispatchEvent(new Event(NEW_CHAT_EVENT));
  window.dispatchEvent(new Event(RECENT_INVESTIGATIONS_UPDATED));
}

export async function resetVayneWorkspace(): Promise<ResetVayneWorkspaceResult> {
  if (typeof window === "undefined") {
    throw new Error("resetVayneWorkspace() must run in the browser");
  }

  console.log(LOG_PREFIX);

  const backend = await resetWorkspace();
  logStep("investigations cleared");
  logStep("findings cleared");
  logStep("attack paths cleared");
  logStep("evidence cleared");

  clearConversationSession();
  clearRecentInvestigations();
  clearAllInvestigationSessions();
  clearVayneStorageKeys(localStorage);
  clearVayneStorageKeys(sessionStorage);
  logStep("storage cleared");

  await clearVayneIndexedDb();
  await clearVayneCaches();
  logStep("cache cleared");

  notifyWorkspaceCleared();
  logStep("workspace reset complete");

  return { backend };
}

export async function resetVayneWorkspaceAndReload(): Promise<void> {
  await resetVayneWorkspace();
  window.location.replace("/");
}

declare global {
  interface Window {
    resetVayne?: () => Promise<void>;
  }
}

export function attachResetVayneConsoleCommand() {
  if (typeof window === "undefined") return;
  window.resetVayne = async () => {
    await resetVayneWorkspaceAndReload();
  };
}
