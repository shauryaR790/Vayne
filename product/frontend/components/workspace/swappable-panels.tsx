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
  loadWorkspacePanelOrder,
  panelDragMime,
  panelSlotClass,
  saveWorkspacePanelOrder,
  swapWorkspacePanels,
  type WorkspacePanelId,
} from "@/lib/workspace-panel-order";
import { cn } from "@/lib/utils";type PanelOrderContextValue = {
  order: WorkspacePanelId[];
  swap: (a: WorkspacePanelId, b: WorkspacePanelId) => void;
  dragOverId: WorkspacePanelId | null;
  setDragOverId: (id: WorkspacePanelId | null) => void;
};

const PanelOrderContext = createContext<PanelOrderContextValue | null>(null);

export function WorkspacePanelOrderProvider({ children }: { children: ReactNode }) {
  const [order, setOrder] = useState<WorkspacePanelId[]>(() => loadWorkspacePanelOrder());
  const [dragOverId, setDragOverId] = useState<WorkspacePanelId | null>(null);

  useEffect(() => {
    saveWorkspacePanelOrder(order);
  }, [order]);

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

/** Droppable/draggable column shell for one of the three workspace panels. */
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
        panelSlotClass(id),
        "relative min-h-0 overflow-hidden transition-[box-shadow] duration-150",
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

/** Renders the three panels in persisted left-to-right order. */
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
        "flex min-h-0 min-w-0 flex-1 flex-col divide-y divide-vx-border lg:flex-row lg:divide-x lg:divide-y-0",
        className,
      )}
    >
      {order.map((id) => (
        <SwappablePanelSlot key={id} id={id}>
          {panels[id]}
        </SwappablePanelSlot>
      ))}
    </div>
  );
}
