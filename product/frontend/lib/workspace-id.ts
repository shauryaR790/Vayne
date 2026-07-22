/** Stable per-browser workspace id for backend isolation. */

const WORKSPACE_KEY = "vayne-workspace-id";

export function getWorkspaceId(): string {
  if (typeof window === "undefined") return "default";
  let id = localStorage.getItem(WORKSPACE_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ws-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(WORKSPACE_KEY, id);
  }
  return id;
}

export function workspaceHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "X-Vayne-Workspace-Id": getWorkspaceId(),
    ...extra,
  };
}
