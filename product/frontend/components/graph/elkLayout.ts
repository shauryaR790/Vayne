import type { GraphEdge, GraphNode } from "@/lib/types";
import { nodeSizeForType } from "@/lib/graph-node-styles";
import { normalizeGraphType } from "./graphUtils";

export interface ElkLayoutPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

const X_GAP = 220;
const Y_GAP = 92;
const MARGIN = 48;
/** Max nodes stacked vertically before spilling into the next horizontal column. */
const MAX_ROWS_PER_COLUMN = 4;

function nodeDimensions(node: GraphNode): { width: number; height: number } {
  const secondary = node.id.includes("evidence:");
  const t = normalizeGraphType(node);
  if (t === "group") return { width: 180, height: 64 };
  return nodeSizeForType(t, secondary);
}

function assignLayers(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const ids = new Set(nodes.map((n) => n.id));
  const layer = new Map<string, number>();
  const incoming = new Map<string, string[]>();

  for (const id of ids) incoming.set(id, []);
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) continue;
    incoming.get(e.target)!.push(e.source);
  }

  const roots = nodes.filter((n) => {
    const inc = incoming.get(n.id) ?? [];
    if (!inc.length) return true;
    const t = normalizeGraphType(n);
    return t === "endpoint" || n.id.startsWith("entry:");
  });

  const queue: string[] = [];
  for (const r of roots) {
    layer.set(r.id, 0);
    queue.push(r.id);
  }

  if (!queue.length && nodes[0]) {
    layer.set(nodes[0].id, 0);
    queue.push(nodes[0].id);
  }

  const out = new Map<string, string[]>();
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source)!.push(e.target);
  }

  const visited = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const base = layer.get(cur) ?? 0;
    for (const next of out.get(cur) ?? []) {
      const nextLayer = base + 1;
      const prev = layer.get(next);
      if (prev == null || nextLayer > prev) {
        layer.set(next, nextLayer);
        queue.push(next);
      }
    }
  }

  let fallback = 0;
  for (const n of nodes) {
    if (!layer.has(n.id)) {
      layer.set(n.id, fallback % 3);
      fallback += 1;
    }
  }

  return layer;
}

function sortLayerNodes(ids: string[], nodeMap: Map<string, GraphNode>): string[] {
  return [...ids].sort((a, b) => {
    const na = nodeMap.get(a);
    const nb = nodeMap.get(b);
    const ta = na ? normalizeGraphType(na) : "";
    const tb = nb ? normalizeGraphType(nb) : "";
    const order = ["endpoint", "asset", "service", "software", "vulnerability", "attack", "verified"];
    const oa = order.indexOf(ta);
    const ob = order.indexOf(tb);
    if (oa !== ob) return (oa === -1 ? 99 : oa) - (ob === -1 ? 99 : ob);
    return (na?.label ?? a).localeCompare(nb?.label ?? b);
  });
}

/**
 * Horizontal attack-path layout: depth goes left→right.
 * Wide layers spill into extra columns instead of one tall vertical stack.
 */
export function computeHorizontalAttackLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, ElkLayoutPosition> {
  const positions = new Map<string, ElkLayoutPosition>();
  if (!nodes.length) return positions;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const layers = assignLayers(nodes, edges);
  const byLayer = new Map<number, string[]>();

  for (const n of nodes) {
    const l = layers.get(n.id) ?? 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(n.id);
  }

  const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b);
  let maxY = 0;

  for (const layerIndex of sortedLayers) {
    const ids = sortLayerNodes(byLayer.get(layerIndex)!, nodeMap);
    const columns = Math.max(1, Math.ceil(ids.length / MAX_ROWS_PER_COLUMN));

    ids.forEach((id, index) => {
      const colOffset = Math.floor(index / MAX_ROWS_PER_COLUMN);
      const row = index % MAX_ROWS_PER_COLUMN;
      const dim = nodeDimensions(nodeMap.get(id)!);
      const x = MARGIN + (layerIndex + colOffset) * X_GAP;
      const y = MARGIN + row * Y_GAP;
      positions.set(id, { x, y, ...dim });
      maxY = Math.max(maxY, y + dim.height);
    });
  }

  if (maxY > 0) {
    const targetMid = maxY / 2;
    for (const [id, pos] of positions) {
      const dim = nodeDimensions(nodeMap.get(id)!);
      const centeredY = pos.y - targetMid + MARGIN + (MAX_ROWS_PER_COLUMN * Y_GAP) / 2;
      positions.set(id, { ...pos, y: Math.max(MARGIN, centeredY) });
    }
  }

  return positions;
}

export async function computeElkLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Promise<Map<string, ElkLayoutPosition>> {
  return computeHorizontalAttackLayout(nodes, edges);
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
    bounds: { width: maxX + MARGIN, height: maxY + MARGIN },
  };
}
