import ELK, { type ElkExtendedEdge, type ElkNode } from "elkjs/lib/elk.bundled.js";

import type { GraphEdge, GraphNode } from "@/lib/types";
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH } from "@/lib/graph-node-styles";
import { normalizeGraphType } from "./graphUtils";

const elk = new ELK();

const ELK_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.spacing.nodeNode": "36",
  "elk.layered.spacing.nodeNodeBetweenLayers": "96",
  "elk.layered.spacing.edgeNodeBetweenLayers": "28",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.layering.strategy": "LONGEST_PATH",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.edgeRouting": "SPLINES",
  "elk.padding": "[top=24,left=32,bottom=24,right=32]",
};

/** Max nodes side-by-side in one layer before wrapping to another row. */
const MAX_COLS = 3;
const COL_GAP = 48;
const ROW_GAP = 88;

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

/**
 * Keep top-to-bottom layers readable on square viewports:
 * wide layers wrap into extra rows instead of stretching the canvas horizontally.
 */
function spreadDenseLayers(
  positions: Map<string, ElkLayoutPosition>,
  nodes: GraphNode[],
): Map<string, ElkLayoutPosition> {
  const byY = new Map<number, string[]>();
  for (const node of nodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    const bucket = Math.round(pos.y / 40) * 40;
    if (!byY.has(bucket)) byY.set(bucket, []);
    byY.get(bucket)!.push(node.id);
  }

  const next = new Map(positions);
  const layerKeys = [...byY.keys()].sort((a, b) => a - b);
  let yCursor = 24;

  for (const key of layerKeys) {
    const ids = byY.get(key)!;
    ids.sort((a, b) => (next.get(a)?.x ?? 0) - (next.get(b)?.x ?? 0));

    const rowHeight = Math.max(
      ...ids.map((id) => next.get(id)?.height ?? GRAPH_NODE_HEIGHT),
      GRAPH_NODE_HEIGHT,
    );

    if (ids.length <= MAX_COLS) {
      const totalWidth =
        ids.reduce((sum, id) => sum + (next.get(id)?.width ?? GRAPH_NODE_WIDTH), 0) +
        Math.max(0, ids.length - 1) * COL_GAP;
      let x = Math.max(32, 200 - totalWidth / 2);
      for (const id of ids) {
        const pos = next.get(id);
        if (!pos) continue;
        next.set(id, { ...pos, x, y: yCursor });
        x += pos.width + COL_GAP;
      }
      yCursor += rowHeight + ROW_GAP;
      continue;
    }

    ids.forEach((id, index) => {
      const pos = next.get(id);
      if (!pos) return;
      const col = index % MAX_COLS;
      const row = Math.floor(index / MAX_COLS);
      next.set(id, {
        ...pos,
        x: 32 + col * (GRAPH_NODE_WIDTH + COL_GAP),
        y: yCursor + row * (rowHeight + 28),
      });
    });
    const rows = Math.ceil(ids.length / MAX_COLS);
    yCursor += rows * (rowHeight + 28) + ROW_GAP - 28;
  }

  // Center the finished stack horizontally in a typical square viewport band.
  let minX = Infinity;
  let maxX = -Infinity;
  for (const pos of next.values()) {
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x + pos.width);
  }
  const contentWidth = maxX - minX;
  const targetLeft = Math.max(24, (420 - contentWidth) / 2);
  const shiftX = targetLeft - minX;
  if (Number.isFinite(shiftX) && Math.abs(shiftX) > 1) {
    for (const [id, pos] of next) {
      next.set(id, { ...pos, x: pos.x + shiftX });
    }
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
        map.set(node.id, {
          x: 48 + (i % MAX_COLS) * (GRAPH_NODE_WIDTH + COL_GAP),
          y: 32 + Math.floor(i / MAX_COLS) * (GRAPH_NODE_HEIGHT + ROW_GAP),
          ...dim,
        });
        return map;
      }, new Map<string, ElkLayoutPosition>()),
      nodes,
    );
  }
}
