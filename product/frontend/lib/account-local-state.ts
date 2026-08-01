/** Clear browser state that must not leak across accounts / workspaces. */

import { clearAuthSession, getAuthProfile, setAuthSession, type AuthProfile } from "@/lib/auth";
import { resetConversationToHome } from "@/lib/conversation-session";
import { clearAllInvestigationSessions } from "@/lib/investigation-session";
import {
  clearRecentInvestigations,
  invalidateHistorySync,
  RECENT_INVESTIGATIONS_UPDATED,
} from "@/lib/recent-investigations";

const WORKSPACE_KEY = "vayne-workspace-id";
const BOUND_WORKSPACE_KEY = "vayne-bound-auth-workspace-id";

function notifyHistoryCleared() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RECENT_INVESTIGATIONS_UPDATED));
}

/** Wipe history, sessions, and active conversation for the current browser. */
export function clearAccountBoundLocalState() {
  if (typeof window === "undefined") return;
  invalidateHistorySync();
  clearRecentInvestigations();
  clearAllInvestigationSessions();
  resetConversationToHome();
  notifyHistoryCleared();
}

/**
 * Bind this browser to an authenticated team workspace and clear any prior
 * account's local history/sessions first.
 */
export function enterAuthWorkspace(profile: AuthProfile, token: string) {
  if (typeof window === "undefined") return;

  const previousBound = window.localStorage.getItem(BOUND_WORKSPACE_KEY);
  const previousProfile = getAuthProfile();
  const switching =
    previousBound !== profile.workspace_id ||
    previousProfile?.workspace_id !== profile.workspace_id ||
    previousProfile?.email !== profile.email;

  if (switching) {
    clearAccountBoundLocalState();
  }

  setAuthSession(token, profile);
  window.localStorage.setItem(WORKSPACE_KEY, profile.workspace_id);
  window.localStorage.setItem(BOUND_WORKSPACE_KEY, profile.workspace_id);
}

/** Log out and start a fresh guest workspace (empty history). */
export function leaveAuthWorkspace() {
  if (typeof window === "undefined") return;
  clearAccountBoundLocalState();
  clearAuthSession();
  window.localStorage.removeItem(BOUND_WORKSPACE_KEY);
  window.localStorage.removeItem(WORKSPACE_KEY);
}
