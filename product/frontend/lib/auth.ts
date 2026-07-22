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

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getAuthProfile(): AuthProfile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(AUTH_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthProfile;
  } catch {
    return null;
  }
}

export function setAuthSession(token: string, profile: AuthProfile) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_PROFILE_KEY);
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
