import { getNodesBounds, type ReactFlowInstance, type Node } from "@xyflow/react";
import type { GraphEdge, GraphNode } from "@/lib/types";

export const FIT_PADDING = 0.2;
export const FIT_DURATION = 800;
export const FIT_MAX_ZOOM = 1.4;
export const FIT_MIN_ZOOM = 0.7;

export const WORKSTATION_FIT_PADDING = 0.12;
export const WORKSTATION_FIT_MAX_ZOOM = 1;
export const WORKSTATION_FIT_MIN_ZOOM = 0.72;

/** Fit all visible nodes to viewport with animated centering. */
export function applyGraphFit(
  instance: ReactFlowInstance,
  flowNodes: Node[],
  _graphNodes?: GraphNode[],
  _graphEdges?: GraphEdge[],
): void {
  const targets = flowNodes.filter((n) => !n.hidden);
  if (!targets.length) return;

  instance.fitView({
    nodes: targets,
    padding: FIT_PADDING,
    duration: FIT_DURATION,
    maxZoom: FIT_MAX_ZOOM,
    minZoom: FIT_MIN_ZOOM,
  });
}

/** Wide workstation panel — fit height, keep zoom readable, pan sideways for width. */
export function applyWorkstationGraphFit(
  instance: ReactFlowInstance,
  flowNodes: Node[],
  container?: { width: number; height: number },
): void {
  const targets = flowNodes.filter((n) => !n.hidden);
  if (!targets.length) return;

  const bounds = getNodesBounds(targets);
  const viewport =
    container ??
    (() => {
      const el = document.querySelector(".react-flow__viewport")?.parentElement;
      const rect = el?.getBoundingClientRect();
      return { width: rect?.width ?? 800, height: rect?.height ?? 480 };
    })();

  const padY = viewport.height * WORKSTATION_FIT_PADDING;
  const padX = 28;
  const zoom = Math.min(
    WORKSTATION_FIT_MAX_ZOOM,
    Math.max(
      WORKSTATION_FIT_MIN_ZOOM,
      (viewport.height - padY * 2) / Math.max(bounds.height, 1),
    ),
  );

  const x = padX - bounds.x * zoom;
  const y = padY + (viewport.height - padY * 2 - bounds.height * zoom) / 2 - bounds.y * zoom;

  instance.setViewport({ x, y, zoom }, { duration: FIT_DURATION });
}
