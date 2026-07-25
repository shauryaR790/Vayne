/** Persistable order of the three main workspace tab panels. */

export type WorkspacePanelId = "engine" | "trace" | "analyst";

export const DEFAULT_WORKSPACE_PANEL_ORDER: WorkspacePanelId[] = [
  "engine",
  "trace",
  "analyst",
];

/** Bump when layout contract changes so stale orders cannot leave a crushed column. */
const STORAGE_KEY = "vayne-workspace-panel-order-v2";
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

/**
 * Desktop dock widths only — this row is gated behind isLgUp, so do not use
 * `w-full` / `lg:` toggles here (they can crush flex siblings to 0 width).
 */
export function panelSlotClass(id: WorkspacePanelId): string {
  switch (id) {
    case "engine":
      return "flex min-h-0 min-w-[280px] flex-1 flex-col";
    case "trace":
      return "flex min-h-0 w-[360px] shrink-0 flex-col xl:w-[400px]";
    case "analyst":
      return "flex min-h-0 w-[min(28%,420px)] min-w-[300px] shrink-0 flex-col";
    default:
      return "flex min-h-0 min-w-[280px] flex-1 flex-col";
  }
}
