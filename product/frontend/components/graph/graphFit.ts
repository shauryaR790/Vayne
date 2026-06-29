import type { ReactFlowInstance, Node } from "@xyflow/react";
import type { GraphEdge, GraphNode } from "@/lib/types";

export const FIT_PADDING = 0.2;
export const FIT_DURATION = 800;
export const FIT_MAX_ZOOM = 1.4;
export const FIT_MIN_ZOOM = 0.7;

/** Fit all visible nodes to ~70–80% of viewport with animated centering. */
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
