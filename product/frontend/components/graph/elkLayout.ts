import ELK, { type ElkExtendedEdge, type ElkNode } from "elkjs/lib/elk.bundled.js";

import type { GraphEdge, GraphNode } from "@/lib/types";
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH } from "@/lib/graph-node-styles";
import { normalizeGraphType } from "./graphUtils";

const elk = new ELK();

const ELK_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.spacing.nodeNode": "28",
  "elk.layered.spacing.nodeNodeBetweenLayers": "168",
  "elk.layered.spacing.edgeNodeBetweenLayers": "28",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.layering.strategy": "LONGEST_PATH",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.edgeRouting": "SPLINES",
  "elk.padding": "[top=24,left=32,bottom=24,right=32]",
};

const MAX_ROWS = 5;
const ROW_GAP = 72;
const COL_GAP = 168;

export interface ElkLayoutPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

function nodeDimensions(node: GraphNode): { width: number; height: number } {
  const t = normalizeGraphType(node);
  if (t === "group") return { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT - 8 };
  return { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT };
}

/** Spread dense layers horizontally instead of tall vertical stacks. */
function spreadDenseLayers(
  positions: Map<string, ElkLayoutPosition>,
  nodes: GraphNode[],
): Map<string, ElkLayoutPosition> {
  const byX = new Map<number, string[]>();
  for (const node of nodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    const bucket = Math.round(pos.x / 40) * 40;
    if (!byX.has(bucket)) byX.set(bucket, []);
    byX.get(bucket)!.push(node.id);
  }

  const next = new Map(positions);
  for (const [, ids] of byX) {
    if (ids.length <= MAX_ROWS) continue;
    ids.sort((a, b) => (next.get(a)?.y ?? 0) - (next.get(b)?.y ?? 0));
    ids.forEach((id, index) => {
      const pos = next.get(id);
      if (!pos) return;
      const colOffset = Math.floor(index / MAX_ROWS);
      const row = index % MAX_ROWS;
      next.set(id, {
        ...pos,
        x: pos.x + colOffset * COL_GAP,
        y: 24 + row * ROW_GAP,
      });
    });
  }

  let minY = Infinity;
  let maxY = -Infinity;
  for (const pos of next.values()) {
    minY = Math.min(minY, pos.y);
    maxY = Math.max(maxY, pos.y + pos.height);
  }
  const mid = (minY + maxY) / 2;
  for (const [id, pos] of next) {
    next.set(id, { ...pos, y: pos.y - mid + 120 });
  }

  return next;
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
    return { id: node.id, width: dim.width, height: dim.height };
  });

  const elkEdges: ElkExtendedEdge[] = edges
    .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target) && e.source !== e.target)
    .map((e, i) => ({
      id: `e-${i}`,
      sources: [e.source],
      targets: [e.target],
    }));

  try {
    const laidOut = await elk.layout({
      id: "root",
      layoutOptions: ELK_OPTIONS,
      children: elkNodes,
      edges: elkEdges,
    });

    for (const child of laidOut.children ?? []) {
      positions.set(child.id!, {
        x: child.x ?? 0,
        y: child.y ?? 0,
        width: child.width ?? GRAPH_NODE_WIDTH,
        height: child.height ?? GRAPH_NODE_HEIGHT,
      });
    }
    return spreadDenseLayers(positions, nodes);
  } catch {
    return spreadDenseLayers(
      nodes.reduce((map, node, i) => {
        const dim = nodeDimensions(node);
        map.set(node.id, { x: 32 + i * 200, y: 48, ...dim });
        return map;
      }, new Map<string, ElkLayoutPosition>()),
      nodes,
    );
  }
}
