"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_WORKSPACE_PANEL_ORDER,
  loadWorkspacePanelOrder,
  panelDragMime,
  panelGridTemplate,
  saveWorkspacePanelOrder,
  swapWorkspacePanels,
  type WorkspacePanelId,
} from "@/lib/workspace-panel-order";
import { cn } from "@/lib/utils";

type PanelOrderContextValue = {
  order: WorkspacePanelId[];
  swap: (a: WorkspacePanelId, b: WorkspacePanelId) => void;
  dragOverId: WorkspacePanelId | null;
  setDragOverId: (id: WorkspacePanelId | null) => void;
};

const PanelOrderContext = createContext<PanelOrderContextValue | null>(null);

export function WorkspacePanelOrderProvider({ children }: { children: ReactNode }) {
  // Start with default for SSR/hydration, then restore from localStorage once
  // mounted — otherwise the first client effect would overwrite the user's
  // saved order with the SSR default when leaving docs and returning home.
  const [order, setOrder] = useState<WorkspacePanelId[]>([...DEFAULT_WORKSPACE_PANEL_ORDER]);
  const [ready, setReady] = useState(false);
  const [dragOverId, setDragOverId] = useState<WorkspacePanelId | null>(null);

  useEffect(() => {
    setOrder(loadWorkspacePanelOrder());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveWorkspacePanelOrder(order);
  }, [order, ready]);

  const swap = useCallback((a: WorkspacePanelId, b: WorkspacePanelId) => {
    setOrder((prev) => swapWorkspacePanels(prev, a, b));
    setDragOverId(null);
  }, []);

  const value = useMemo(
    () => ({ order, swap, dragOverId, setDragOverId }),
    [order, swap, dragOverId],
  );

  return <PanelOrderContext.Provider value={value}>{children}</PanelOrderContext.Provider>;
}

export function useWorkspacePanelOrder(): PanelOrderContextValue {
  const ctx = useContext(PanelOrderContext);
  if (!ctx) {
    throw new Error("useWorkspacePanelOrder requires WorkspacePanelOrderProvider");
  }
  return ctx;
}

export function useOptionalWorkspacePanelOrder(): PanelOrderContextValue | null {
  return useContext(PanelOrderContext);
}

/** Droppable cell for one workspace panel — width comes from the parent grid. */
export function SwappablePanelSlot({
  id,
  children,
  className,
}: {
  id: WorkspacePanelId;
  children: ReactNode;
  className?: string;
}) {
  const { swap, dragOverId, setDragOverId } = useWorkspacePanelOrder();
  const over = dragOverId === id;

  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-col overflow-hidden",
        over && "ring-1 ring-inset ring-white/25",
        className,
      )}
      data-workspace-panel={id}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes(panelDragMime())) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOverId(id);
      }}
      onDragLeave={() => {
        if (dragOverId === id) setDragOverId(null);
      }}
      onDrop={(e) => {
        const from = e.dataTransfer.getData(panelDragMime());
        if (!from || from === id) return;
        e.preventDefault();
        e.stopPropagation();
        swap(from as WorkspacePanelId, id);
      }}
    >
      {children}
    </div>
  );
}

/**
 * Desktop dock: CSS grid sized by panel identity.
 * Engine always 39, Trace 29, Analyst 31 — widths travel with the panel on swap.
 */
export function SwappablePanelRow({
  panels,
  className,
}: {
  panels: Record<WorkspacePanelId, ReactNode>;
  className?: string;
}) {
  const { order } = useWorkspacePanelOrder();
  return (
    <div
      className={cn(
        "grid h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden divide-x divide-vx-border",
        className,
      )}
      style={{ gridTemplateColumns: panelGridTemplate(order) }}
    >
      {order.map((id) => (
        <SwappablePanelSlot key={id} id={id}>
          {panels[id]}
        </SwappablePanelSlot>
      ))}
    </div>
  );
}
