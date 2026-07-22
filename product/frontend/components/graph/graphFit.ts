import { type Node, type ReactFlowInstance } from "@xyflow/react";

export const FIT_PADDING = 0.1;
export const FIT_DURATION = 500;
export const FIT_MAX_ZOOM = 1;
export const FIT_MIN_ZOOM = 0.04;

/** Fit the entire graph inside the canvas with 10% padding (width + height). */
export function applyGraphFit(
  instance: ReactFlowInstance,
  flowNodes: Node[],
  options?: { width: number; height: number; maxZoom?: number },
): void {
  const targets = flowNodes.filter((n) => !n.hidden);
  if (!targets.length) return;

  instance.fitView({
    nodes: targets,
    padding: FIT_PADDING,
    duration: FIT_DURATION,
    maxZoom: options?.maxZoom ?? FIT_MAX_ZOOM,
    minZoom: FIT_MIN_ZOOM,
    includeHiddenNodes: false,
  });
}

export function centerOnNode(
  instance: ReactFlowInstance,
  node: Node,
  zoom = 1.05,
): void {
  const width = Number(node.width ?? 196);
  const height = Number(node.height ?? 88);
  instance.setCenter(node.position.x + width / 2, node.position.y + height / 2, {
    zoom,
    duration: FIT_DURATION,
  });
}
