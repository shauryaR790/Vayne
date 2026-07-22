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

function tokenStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

function profileStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function getAuthToken(): string | null {
  return tokenStorage()?.getItem(AUTH_TOKEN_KEY) ?? null;
}

export function getAuthProfile(): AuthProfile | null {
  const raw = profileStorage()?.getItem(AUTH_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthProfile;
  } catch {
    return null;
  }
}

export function setAuthSession(token: string, profile: AuthProfile) {
  tokenStorage()?.setItem(AUTH_TOKEN_KEY, token);
  profileStorage()?.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
}

export function clearAuthSession() {
  tokenStorage()?.removeItem(AUTH_TOKEN_KEY);
  profileStorage()?.removeItem(AUTH_PROFILE_KEY);
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
