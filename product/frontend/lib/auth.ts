/** Client-side auth token storage and helpers. */

const AUTH_TOKEN_KEY = "vayne-auth-token";
const AUTH_PROFILE_KEY = "vayne-auth-profile";

export type AuthProfile = {
  email: string;
  name: string;
  team_id: string;
  team_name: string;
  workspace_id: string;
};

function authStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function getAuthToken(): string | null {
  const store = authStorage();
  if (!store) return null;
  // Prefer localStorage (survives browser restart); migrate legacy sessionStorage.
  const local = store.getItem(AUTH_TOKEN_KEY);
  if (local) return local;
  try {
    const legacy = window.sessionStorage.getItem(AUTH_TOKEN_KEY);
    if (legacy) {
      store.setItem(AUTH_TOKEN_KEY, legacy);
      window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function getAuthProfile(): AuthProfile | null {
  const raw = authStorage()?.getItem(AUTH_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthProfile;
  } catch {
    return null;
  }
}

export function setAuthSession(token: string, profile: AuthProfile) {
  const store = authStorage();
  store?.setItem(AUTH_TOKEN_KEY, token);
  store?.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
  try {
    window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function clearAuthSession() {
  const store = authStorage();
  store?.removeItem(AUTH_TOKEN_KEY);
  store?.removeItem(AUTH_PROFILE_KEY);
  try {
    window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getAuthToken());
}

export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAuthToken();
  if (!token) return { ...extra };
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}
