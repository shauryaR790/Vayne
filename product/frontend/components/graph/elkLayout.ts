import ELK, { type ElkNode, type ElkExtendedEdge } from "elkjs/lib/elk.bundled.js";

import type { GraphEdge, GraphNode } from "@/lib/types";
import { nodeSizeForType } from "@/lib/graph-node-styles";
import { normalizeGraphType } from "./graphUtils";

const elk = new ELK();

const LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.spacing.nodeNode": "48",
  "elk.layered.spacing.nodeNodeBetweenLayers": "96",
  "elk.layered.spacing.edgeNodeBetweenLayers": "40",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.padding": "[top=48,left=48,bottom=48,right=48]",
};

export interface ElkLayoutPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

function nodeDimensions(node: GraphNode): { width: number; height: number } {
  const secondary = node.id.includes("evidence:");
  const t = normalizeGraphType(node);
  if (t === "group") return { width: 190, height: 72 };
  return nodeSizeForType(t, secondary);
}

export async function computeElkLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Promise<Map<string, ElkLayoutPosition>> {
  const positions = new Map<string, ElkLayoutPosition>();
  if (!nodes.length) return positions;

  const visibleIds = new Set(nodes.map((n) => n.id));
  const elkNodes: ElkNode[] = nodes.map((node) => {
    const dim = nodeDimensions(node);
    return {
      id: node.id,
      width: dim.width,
      height: dim.height,
    };
  });

  const elkEdges: ElkExtendedEdge[] = edges
    .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target) && e.source !== e.target)
    .map((e, i) => ({
      id: `e-${i}-${e.source}-${e.target}`,
      sources: [e.source],
      targets: [e.target],
    }));

  const graph: ElkNode = {
    id: "root",
    layoutOptions: LAYOUT_OPTIONS,
    children: elkNodes,
    edges: elkEdges,
  };

  try {
    const laidOut = await elk.layout(graph);
    for (const child of laidOut.children ?? []) {
      positions.set(child.id!, {
        x: child.x ?? 0,
        y: child.y ?? 0,
        width: child.width ?? 170,
        height: child.height ?? 80,
      });
    }
  } catch {
    let x = 48;
    nodes.forEach((node, i) => {
      const dim = nodeDimensions(node);
      positions.set(node.id, { x, y: 48 + (i % 12) * (dim.height + 32), ...dim });
      x += dim.width + 64;
    });
  }

  return positions;
}

export async function computeElkLayoutWithBounds(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Promise<{ positions: Map<string, ElkLayoutPosition>; bounds: { width: number; height: number } }> {
  const positions = await computeElkLayout(nodes, edges);
  let maxX = 0;
  let maxY = 0;
  for (const pos of positions.values()) {
    maxX = Math.max(maxX, pos.x + pos.width);
    maxY = Math.max(maxY, pos.y + pos.height);
  }
  return {
    positions,
    bounds: { width: maxX + 48, height: maxY + 48 },
  };
}
