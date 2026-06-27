import type { ReactFlowInstance, Node } from "@xyflow/react";
import type { GraphEdge, GraphNode } from "@/lib/types";
import { isSecondaryGraphNode, normalizeGraphType } from "./layoutEngine";

export const DEFAULT_FIT_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };
export const DEFAULT_MIN_ZOOM = 0.92;

/** Node IDs on the primary attack chain — excludes side evidence nodes. */
export function getPrimaryFitNodeIds(nodes: GraphNode[], edges: GraphEdge[]): Set<string> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const entry = nodes.find((n) => n.id.startsWith("entry:") && !isSecondaryGraphNode(n));
  if (!entry) {
    return new Set(nodes.filter((n) => !isSecondaryGraphNode(n)).map((n) => n.id));
  }

  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

  const vulns = nodes.filter((n) => normalizeGraphType(n) === "vulnerability");
  const onPath = new Set<string>([entry.id]);

  function walkBack(id: string, visited: Set<string>): void {
    if (visited.has(id)) return;
    visited.add(id);
    onPath.add(id);
    for (const e of edges) {
      if (e.target === id && nodeMap.has(e.source) && !isSecondaryGraphNode(nodeMap.get(e.source)!)) {
        walkBack(e.source, visited);
      }
    }
  }

  if (vulns.length) {
    for (const v of vulns) walkBack(v.id, new Set());
  } else {
    const queue = [entry.id];
    const seen = new Set<string>([entry.id]);
    while (queue.length) {
      const id = queue.shift()!;
      onPath.add(id);
      for (const next of adj.get(id) || []) {
        if (!seen.has(next) && !isSecondaryGraphNode(nodeMap.get(next)!)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }

  // Include all services on discovered assets (fan visibility) but not side evidence
  for (const id of [...onPath]) {
    const n = nodeMap.get(id);
    if (n && normalizeGraphType(n) === "asset") {
      for (const e of edges) {
        if (e.source === id) {
          const tgt = nodeMap.get(e.target);
          if (tgt && normalizeGraphType(tgt) === "service" && !isSecondaryGraphNode(tgt)) {
            onPath.add(e.target);
          }
        }
      }
    }
  }

  return onPath;
}

export function applyGraphFit(
  instance: ReactFlowInstance,
  flowNodes: Node[],
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  options?: { all?: boolean },
): void {
  const primaryIds = getPrimaryFitNodeIds(graphNodes, graphEdges);
  let targets = flowNodes.filter((n) => primaryIds.has(n.id));
  if (!targets.length || options?.all) {
    targets = flowNodes.filter((n) => !n.data?.secondary);
  }
  if (!targets.length) targets = flowNodes;

  instance.fitView({
    nodes: targets,
    padding: DEFAULT_FIT_PADDING,
    duration: 300,
    maxZoom: 2,
  });

  requestAnimationFrame(() => {
    const { x, y, zoom } = instance.getViewport();
    if (zoom < DEFAULT_MIN_ZOOM) {
      instance.setViewport({ x, y, zoom: DEFAULT_MIN_ZOOM }, { duration: 200 });
    }
  });
}
