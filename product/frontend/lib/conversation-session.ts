export interface StoredChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface ConversationSession {
  investigationId: string | null;
  messages: StoredChatMessage[];
  scrollTop: number;
  inputDraft: string;
  updatedAt: string;
}

const SESSION_KEY = "vayne-active-conversation";

export function loadConversationSession(): ConversationSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConversationSession;
  } catch {
    return null;
  }
}

export function saveConversationSession(session: ConversationSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ ...session, updatedAt: new Date().toISOString() }),
  );
}

export function clearConversationSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

export const NEW_CHAT_EVENT = "vayne:new-chat";

/** Clear stored conversation and notify the home view to reset. */
export function resetConversationToHome() {
  clearConversationSession();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NEW_CHAT_EVENT));
  }
}
