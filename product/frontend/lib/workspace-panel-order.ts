/** Persistable order of the three main workspace tab panels. */

export type WorkspacePanelId = "engine" | "trace" | "analyst";

export const DEFAULT_WORKSPACE_PANEL_ORDER: WorkspacePanelId[] = [
  "engine",
  "trace",
  "analyst",
];

/** Bump when layout contract changes so stale orders cannot leave a crushed column. */
const STORAGE_KEY = "vayne-workspace-panel-order-v3";
const PANEL_MIME = "application/x-vayne-panel";

export function panelDragMime(): string {
  return PANEL_MIME;
}

export function isWorkspacePanelId(value: string): value is WorkspacePanelId {
  return value === "engine" || value === "trace" || value === "analyst";
}

export function loadWorkspacePanelOrder(): WorkspacePanelId[] {
  if (typeof window === "undefined") return [...DEFAULT_WORKSPACE_PANEL_ORDER];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_WORKSPACE_PANEL_ORDER];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 3) {
      return [...DEFAULT_WORKSPACE_PANEL_ORDER];
    }
    if (!parsed.every((id) => typeof id === "string" && isWorkspacePanelId(id))) {
      return [...DEFAULT_WORKSPACE_PANEL_ORDER];
    }
    const unique = new Set(parsed);
    if (unique.size !== 3) return [...DEFAULT_WORKSPACE_PANEL_ORDER];
    return parsed as WorkspacePanelId[];
  } catch {
    return [...DEFAULT_WORKSPACE_PANEL_ORDER];
  }
}

export function saveWorkspacePanelOrder(order: WorkspacePanelId[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    /* ignore quota */
  }
}

/** Width share follows the panel identity, not the column index. */
export const PANEL_WIDTH_FR: Record<WorkspacePanelId, number> = {
  engine: 39,
  trace: 29,
  analyst: 31,
};

export function panelGridTemplate(order: WorkspacePanelId[]): string {
  return order.map((id) => `minmax(0, ${PANEL_WIDTH_FR[id]}fr)`).join(" ");
}

/** Swap two panels by id (positions exchange). */
export function swapWorkspacePanels(
  order: WorkspacePanelId[],
  a: WorkspacePanelId,
  b: WorkspacePanelId,
): WorkspacePanelId[] {
  if (a === b) return order;
  const next = [...order];
  const i = next.indexOf(a);
  const j = next.indexOf(b);
  if (i < 0 || j < 0) return order;
  next[i] = b;
  next[j] = a;
  return next;
}
