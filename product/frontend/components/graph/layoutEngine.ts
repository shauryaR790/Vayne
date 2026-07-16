import type { GraphEdge, GraphNode } from "@/lib/types";

export const LAYOUT = {
  marginLeft: 60,
  marginRight: 60,
  marginTop: 60,
  marginBottom: 60,
  columnWidth: 280,
  minVerticalGap: 100,
  preferredVerticalGap: 120,
  nodeWidth: 200,
  nodeHeight: 90,
  pillHeight: 70,
  secondaryWidth: 150,
  secondaryHeight: 56,
  secondaryGap: 40,
  chainGap: 160,
} as const;

/** Workstation layout — fixed columns, one readable row per service chain. */
export const WIDE_LAYOUT = {
  marginTop: 44,
  marginRight: 64,
  marginBottom: 48,
  colGap: 56,
  colX: {
    entry: 40,
    asset: 240,
    service: 520,
    software: 780,
    vulnerability: 1040,
  },
  rowHeight: 96,
  rowGap: 20,
  assetBlockGap: 32,
  stackGap: 12,
} as const;

export type GraphLayoutMode = "default" | "wide";

const COLUMN_BY_TYPE: Record<string, number> = {
  endpoint: 0,
  asset: 1,
  service: 2,
  software: 3,
  vulnerability: 4,
};

const ANIMATION_WAVE: Record<string, number> = {
  endpoint: 0,
  asset: 1,
  service: 2,
  software: 3,
  vulnerability: 4,
  secondary: 5,
};

export interface LayoutNodeMeta {
  x: number;
  y: number;
  column: number;
  secondary: boolean;
  animationWave: number;
  animationIndex: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  positions: Map<string, LayoutNodeMeta>;
  bounds: { width: number; height: number };
}

interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  column: number;
}

function normalizeType(node: GraphNode): string {
  const raw = node as GraphNode & { node_type?: string };
  const t = (node.type || raw.node_type || "").toLowerCase();
  if (t) return t;
  const id = node.id.toLowerCase();
  if (id.startsWith("entry:") || id.startsWith("exploit:") || id.startsWith("access:")) return "endpoint";
  if (id.startsWith("asset:")) return "asset";
  if (id.startsWith("service:")) return "service";
  if (id.startsWith("software:")) return "software";
  if (id.startsWith("vuln") || id.includes("cve")) return "vulnerability";
  return "unknown";
}

function isPrimaryEntry(node: GraphNode): boolean {
  const t = normalizeType(node);
  return t === "endpoint" && node.id.startsWith("entry:");
}

function isSecondaryEvidence(node: GraphNode): boolean {
  return normalizeType(node) === "endpoint" && !isPrimaryEntry(node);
}

import { nodeSizeForType } from "@/lib/graph-node-styles";

function nodeDimensions(node: GraphNode, secondary: boolean): { width: number; height: number } {
  if (secondary) return { width: LAYOUT.secondaryWidth, height: LAYOUT.secondaryHeight };
  const t = normalizeType(node);
  return nodeSizeForType(t, false);
}

function columnX(column: number): number {
  return LAYOUT.marginLeft + column * LAYOUT.columnWidth;
}

function resolveWideColumnCollisions(boxes: Box[]): void {
  const byColumn = new Map<number, Box[]>();
  for (const box of boxes) {
    if (!byColumn.has(box.column)) byColumn.set(box.column, []);
    byColumn.get(box.column)!.push(box);
  }

  for (const colBoxes of byColumn.values()) {
    colBoxes.sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 1; i < colBoxes.length; i++) {
      const prev = colBoxes[i - 1];
      const curr = colBoxes[i];
      const minY = prev.y + prev.height + WIDE_LAYOUT.stackGap;
      if (curr.y < minY) curr.y = minY;
    }
  }
}

function resolveColumnCollisions(boxes: Box[]): void {
  const byColumn = new Map<number, Box[]>();
  for (const box of boxes) {
    if (!byColumn.has(box.column)) byColumn.set(box.column, []);
    byColumn.get(box.column)!.push(box);
  }

  for (const colBoxes of byColumn.values()) {
    colBoxes.sort((a, b) => a.y - b.y);
    for (let i = 1; i < colBoxes.length; i++) {
      const prev = colBoxes[i - 1];
      const curr = colBoxes[i];
      const minY = prev.y + prev.height + LAYOUT.minVerticalGap;
      if (curr.y < minY) curr.y = minY;
    }
  }
}

function findParentId(
  nodeId: string,
  edges: GraphEdge[],
  nodeMap: Map<string, GraphNode>,
  preferredTypes: string[],
): string | null {
  for (const e of edges) {
    if (e.target === nodeId) {
      const parent = nodeMap.get(e.source);
      if (parent && preferredTypes.includes(normalizeType(parent))) return e.source;
    }
    if (e.source === nodeId) {
      const parent = nodeMap.get(e.target);
      if (parent && preferredTypes.includes(normalizeType(parent))) return e.target;
    }
  }
  return null;
}

function sortServices(ids: string[], nodeMap: Map<string, GraphNode>): string[] {
  return [...ids].sort((a, b) => {
    const la = nodeMap.get(a)?.label || a;
    const lb = nodeMap.get(b)?.label || b;
    const pa = parseInt(la.match(/:(\d+)/)?.[1] || "0", 10);
    const pb = parseInt(lb.match(/:(\d+)/)?.[1] || "0", 10);
    return pa - pb || la.localeCompare(lb);
  });
}

/** Group software+vuln chains for vertical stacking below the primary row. */
function groupAttackChains(
  boxes: Box[],
  edges: GraphEdge[],
  nodeMap: Map<string, GraphNode>,
): string[][] {
  const softwareIds = boxes
    .filter((b) => {
      const n = nodeMap.get(b.id);
      return n && normalizeType(n) === "software";
    })
    .map((b) => b.id);

  if (softwareIds.length <= 1) return softwareIds.length ? [softwareIds] : [];

  const chains: string[][] = [];
  for (const swId of softwareIds) {
    const chain = [swId];
    for (const e of edges) {
      if (e.source === swId) {
        const tgt = nodeMap.get(e.target);
        if (tgt && normalizeType(tgt) === "vulnerability") chain.push(e.target);
      }
    }
    chains.push(chain);
  }

  chains.sort((a, b) => {
    const ay = boxes.find((x) => x.id === a[0])?.y ?? 0;
    const by = boxes.find((x) => x.id === b[0])?.y ?? 0;
    return ay - by;
  });

  return chains;
}

function computeWideGraphLayout(nodes: GraphNode[], edges: GraphEdge[]): LayoutResult {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const boxes: Box[] = [];
  const secondaryIds = new Set<string>();
  const waveCounters = new Map<number, number>();

  const primary = nodes.filter((n) => isPrimaryEntry(n));
  const secondary = nodes.filter((n) => isSecondaryEvidence(n));
  const core = nodes.filter((n) => !isSecondaryEvidence(n));

  for (const s of secondary) secondaryIds.add(s.id);

  const assetToServices = new Map<string, string[]>();
  const serviceToSoftware = new Map<string, string[]>();
  const softwareToVuln = new Map<string, string[]>();

  for (const e of edges) {
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src || !tgt) continue;
    const st = normalizeType(src);
    const tt = normalizeType(tgt);
    if (st === "asset" && tt === "service") {
      if (!assetToServices.has(e.source)) assetToServices.set(e.source, []);
      assetToServices.get(e.source)!.push(e.target);
    }
    if (st === "service" && tt === "software") {
      if (!serviceToSoftware.has(e.source)) serviceToSoftware.set(e.source, []);
      serviceToSoftware.get(e.source)!.push(e.target);
    }
    if (st === "software" && tt === "vulnerability") {
      if (!softwareToVuln.has(e.source)) softwareToVuln.set(e.source, []);
      softwareToVuln.get(e.source)!.push(e.target);
    }
  }

  const assets = core.filter((n) => normalizeType(n) === "asset");
  const assignedServices = new Set<string>();
  const assignedSoftware = new Set<string>();
  const assignedVulns = new Set<string>();

  let cursorY: number = WIDE_LAYOUT.marginTop;

  const placeChainRow = (rowY: number, serviceId: string): number => {
    const svcNode = nodeMap.get(serviceId);
    if (!svcNode) return rowY + WIDE_LAYOUT.rowHeight + WIDE_LAYOUT.rowGap;

    assignedServices.add(serviceId);
    const svcDim = nodeDimensions(svcNode, false);
    boxes.push({
      id: serviceId,
      column: 2,
      x: WIDE_LAYOUT.colX.service,
      y: rowY,
      width: svcDim.width,
      height: svcDim.height,
    });

    const swIds = serviceToSoftware.get(serviceId) || [];
    let swY = rowY;
    let rowBottom = rowY + svcDim.height;

    for (const swId of swIds) {
      if (assignedSoftware.has(swId)) continue;
      assignedSoftware.add(swId);
      const swNode = nodeMap.get(swId);
      if (!swNode) continue;
      const swDim = nodeDimensions(swNode, false);
      boxes.push({
        id: swId,
        column: 3,
        x: WIDE_LAYOUT.colX.software,
        y: swY,
        width: swDim.width,
        height: swDim.height,
      });
      rowBottom = Math.max(rowBottom, swY + swDim.height);

      let vulnOffset = 0;
      const vIds = softwareToVuln.get(swId) || [];
      for (const vId of vIds) {
        if (assignedVulns.has(vId)) continue;
        assignedVulns.add(vId);
        const vNode = nodeMap.get(vId);
        if (!vNode) continue;
        const vDim = nodeDimensions(vNode, false);
        boxes.push({
          id: vId,
          column: 4,
          x: WIDE_LAYOUT.colX.vulnerability + vulnOffset,
          y: swY,
          width: vDim.width,
          height: vDim.height,
        });
        vulnOffset += vDim.width + WIDE_LAYOUT.colGap;
        rowBottom = Math.max(rowBottom, swY + vDim.height);
      }

      swY += swDim.height + WIDE_LAYOUT.stackGap;
    }

    return rowBottom + WIDE_LAYOUT.rowGap;
  };

  if (assets.length) {
    for (const asset of assets) {
      const svcIds = sortServices(assetToServices.get(asset.id) || [], nodeMap);
      const blockStartY = cursorY;
      const blockRows = Math.max(svcIds.length, 1);
      const blockHeight =
        blockRows * WIDE_LAYOUT.rowHeight + (blockRows - 1) * WIDE_LAYOUT.rowGap;
      const assetDim = nodeDimensions(asset, false);

      boxes.push({
        id: asset.id,
        column: 1,
        x: WIDE_LAYOUT.colX.asset,
        y: blockStartY + blockHeight / 2 - assetDim.height / 2,
        width: assetDim.width,
        height: assetDim.height,
      });

      if (svcIds.length) {
        let rowY = blockStartY;
        for (const sid of svcIds) {
          rowY = placeChainRow(rowY, sid);
        }
        cursorY = rowY + WIDE_LAYOUT.assetBlockGap - WIDE_LAYOUT.rowGap;
      } else {
        cursorY = blockStartY + blockHeight + WIDE_LAYOUT.assetBlockGap;
      }
    }
  }

  const orphanServices = core.filter(
    (n) => normalizeType(n) === "service" && !assignedServices.has(n.id),
  );
  for (const svc of orphanServices) {
    cursorY = placeChainRow(cursorY, svc.id);
  }

  const placed = new Set(boxes.map((b) => b.id));
  for (const n of core) {
    if (placed.has(n.id)) continue;
    const dim = nodeDimensions(n, false);
    const t = normalizeType(n);
    const col =
      t === "asset"
        ? 1
        : t === "software"
          ? 3
          : t === "vulnerability"
            ? 4
            : 2;
    const x =
      col === 1
        ? WIDE_LAYOUT.colX.asset
        : col === 3
          ? WIDE_LAYOUT.colX.software
          : col === 4
            ? WIDE_LAYOUT.colX.vulnerability
            : WIDE_LAYOUT.colX.service;
    boxes.push({
      id: n.id,
      column: col,
      x,
      y: cursorY,
      width: dim.width,
      height: dim.height,
    });
    cursorY += WIDE_LAYOUT.rowHeight + WIDE_LAYOUT.rowGap;
  }

  const contentMid =
    boxes.length > 0
      ? (Math.min(...boxes.map((b) => b.y)) + Math.max(...boxes.map((b) => b.y + b.height))) / 2
      : WIDE_LAYOUT.marginTop + 120;

  for (const entry of primary) {
    const dim = nodeDimensions(entry, false);
    boxes.push({
      id: entry.id,
      column: 0,
      x: WIDE_LAYOUT.colX.entry,
      y: contentMid - dim.height / 2,
      width: dim.width,
      height: dim.height,
    });
  }

  let secondaryY = cursorY + 16;
  for (const s of secondary) {
    const dim = nodeDimensions(s, true);
    boxes.push({
      id: s.id,
      column: 3,
      x: WIDE_LAYOUT.colX.software,
      y: secondaryY,
      width: dim.width,
      height: dim.height,
    });
    secondaryY += dim.height + 12;
  }

  resolveWideColumnCollisions(boxes);

  const positions = new Map<string, LayoutNodeMeta>();
  let maxX = 0;
  let maxY = 0;

  for (const box of boxes) {
    const node = nodeMap.get(box.id);
    const secondary = secondaryIds.has(box.id);
    const t = node ? normalizeType(node) : "unknown";
    const wave = secondary ? ANIMATION_WAVE.secondary : (ANIMATION_WAVE[t] ?? 2);
    const idx = waveCounters.get(wave) ?? 0;
    waveCounters.set(wave, idx + 1);

    positions.set(box.id, {
      x: box.x,
      y: box.y,
      column: box.column,
      secondary,
      animationWave: wave,
      animationIndex: idx,
      width: box.width,
      height: box.height,
    });
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }

  return {
    positions,
    bounds: {
      width: maxX + WIDE_LAYOUT.marginRight,
      height: maxY + WIDE_LAYOUT.marginBottom,
    },
  };
}

export function computeGraphLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options?: { mode?: GraphLayoutMode },
): LayoutResult {
  if (options?.mode === "wide") {
    return computeWideGraphLayout(nodes, edges);
  }
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const boxes: Box[] = [];
  const secondaryIds = new Set<string>();
  const waveCounters = new Map<number, number>();

  const primary = nodes.filter((n) => isPrimaryEntry(n));
  const secondary = nodes.filter((n) => isSecondaryEvidence(n));
  const core = nodes.filter((n) => !isSecondaryEvidence(n));

  for (const s of secondary) secondaryIds.add(s.id);

  const byType = new Map<string, GraphNode[]>();
  for (const n of core) {
    const t = normalizeType(n);
    const col = COLUMN_BY_TYPE[t] ?? 2;
    const key = String(col);
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(n);
  }

  const assetToServices = new Map<string, string[]>();
  const serviceToSoftware = new Map<string, string[]>();
  const softwareToVuln = new Map<string, string[]>();

  for (const e of edges) {
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src || !tgt) continue;
    const st = normalizeType(src);
    const tt = normalizeType(tgt);
    if (st === "asset" && tt === "service") {
      if (!assetToServices.has(e.source)) assetToServices.set(e.source, []);
      assetToServices.get(e.source)!.push(e.target);
    }
    if (st === "service" && tt === "software") {
      if (!serviceToSoftware.has(e.source)) serviceToSoftware.set(e.source, []);
      serviceToSoftware.get(e.source)!.push(e.target);
    }
    if (st === "software" && tt === "vulnerability") {
      if (!softwareToVuln.has(e.source)) softwareToVuln.set(e.source, []);
      softwareToVuln.get(e.source)!.push(e.target);
    }
  }

  const assets = byType.get("1") || [];
  const services = byType.get("2") || [];
  const assignedServices = new Set<string>();

  let cursorY = LAYOUT.marginTop;

  // Column 2 — services fanned per asset
  const assetCenters = new Map<string, number>();
  for (const asset of assets) {
    const svcIds = sortServices(assetToServices.get(asset.id) || [], nodeMap);
    if (!svcIds.length) continue;

    const blockHeight =
      svcIds.length * LAYOUT.preferredVerticalGap + LAYOUT.nodeHeight - LAYOUT.preferredVerticalGap;
    const blockStart = cursorY;
    svcIds.forEach((sid, i) => {
      assignedServices.add(sid);
      const dim = nodeDimensions(nodeMap.get(sid)!, false);
      boxes.push({
        id: sid,
        column: 2,
        x: columnX(2),
        y: blockStart + i * LAYOUT.preferredVerticalGap,
        width: dim.width,
        height: dim.height,
      });
    });
    assetCenters.set(asset.id, blockStart + blockHeight / 2 - LAYOUT.nodeHeight / 2);
    cursorY = blockStart + blockHeight + LAYOUT.minVerticalGap;
  }

  // Orphan services
  const orphans = services.filter((s) => !assignedServices.has(s.id));
  if (orphans.length) {
    orphans.forEach((s, i) => {
      const dim = nodeDimensions(s, false);
      boxes.push({
        id: s.id,
        column: 2,
        x: columnX(2),
        y: cursorY + i * LAYOUT.preferredVerticalGap,
        width: dim.width,
        height: dim.height,
      });
    });
    cursorY += orphans.length * LAYOUT.preferredVerticalGap + LAYOUT.minVerticalGap;
  }

  const contentMid =
    boxes.length > 0
      ? (Math.min(...boxes.map((b) => b.y)) + Math.max(...boxes.map((b) => b.y + b.height))) / 2
      : LAYOUT.marginTop + 200;

  // Column 1 — assets aligned to service clusters
  for (const asset of assets) {
    const dim = nodeDimensions(asset, false);
    const y = assetCenters.get(asset.id) ?? contentMid - dim.height / 2;
    boxes.push({ id: asset.id, column: 1, x: columnX(1), y, width: dim.width, height: dim.height });
  }

  // Column 0 — primary entry centered vertically
  for (const entry of primary) {
    const dim = nodeDimensions(entry, false);
    boxes.push({
      id: entry.id,
      column: 0,
      x: columnX(0),
      y: contentMid - dim.height / 2,
      width: dim.width,
      height: dim.height,
    });
  }

  // Column 3 — software aligned to parent service
  const servicePositions = new Map(boxes.filter((b) => b.column === 2).map((b) => [b.id, b]));
  const softwareNodes = byType.get("3") || [];
  for (const sw of softwareNodes) {
    const parentSvc = findParentId(sw.id, edges, nodeMap, ["service"]);
    const parentBox = parentSvc ? servicePositions.get(parentSvc) : null;
    const dim = nodeDimensions(sw, false);
    boxes.push({
      id: sw.id,
      column: 3,
      x: columnX(3),
      y: parentBox ? parentBox.y : cursorY,
      width: dim.width,
      height: dim.height,
    });
    if (!parentBox) cursorY += LAYOUT.preferredVerticalGap;
  }

  // Column 4 — vulnerabilities aligned to software
  const softwarePositions = new Map(
    boxes.filter((b) => b.column === 3).map((b) => [b.id, b]),
  );
  const vulnNodes = byType.get("4") || [];
  for (const v of vulnNodes) {
    const parentSw = findParentId(v.id, edges, nodeMap, ["software"]);
    const parentBox = parentSw ? softwarePositions.get(parentSw) : null;
    const dim = nodeDimensions(v, false);
    boxes.push({
      id: v.id,
      column: 4,
      x: columnX(4),
      y: parentBox ? parentBox.y : cursorY,
      width: dim.width,
      height: dim.height,
    });
    if (!parentBox) cursorY += LAYOUT.preferredVerticalGap;
  }

  // Unknown types — append to column 2
  const placed = new Set(boxes.map((b) => b.id));
  for (const n of core) {
    if (placed.has(n.id)) continue;
    const t = normalizeType(n);
    const col = COLUMN_BY_TYPE[t] ?? 2;
    const dim = nodeDimensions(n, false);
    boxes.push({
      id: n.id,
      column: col,
      x: columnX(col),
      y: cursorY,
      width: dim.width,
      height: dim.height,
    });
    cursorY += LAYOUT.preferredVerticalGap;
  }

  resolveColumnCollisions(boxes);

  // Secondary evidence nodes — offset below parent software/service
  const secondaryByParent = new Map<string, GraphNode[]>();
  for (const s of secondary) {
    const parent =
      findParentId(s.id, edges, nodeMap, ["software", "vulnerability", "service"]) ||
      softwareNodes[0]?.id ||
      null;
    if (!parent) {
      const dim = nodeDimensions(s, true);
      boxes.push({
        id: s.id,
        column: 3,
        x: columnX(3) + LAYOUT.nodeWidth + 24,
        y: cursorY,
        width: dim.width,
        height: dim.height,
      });
      cursorY += LAYOUT.secondaryGap;
      continue;
    }
    if (!secondaryByParent.has(parent)) secondaryByParent.set(parent, []);
    secondaryByParent.get(parent)!.push(s);
  }

  for (const [parentId, items] of secondaryByParent) {
    const parentBox = boxes.find((b) => b.id === parentId);
    if (!parentBox) continue;
    items.forEach((s, i) => {
      const dim = nodeDimensions(s, true);
      boxes.push({
        id: s.id,
        column: parentBox.column,
        x: parentBox.x + parentBox.width + 20,
        y: parentBox.y + i * (LAYOUT.secondaryHeight + 8),
        width: dim.width,
        height: dim.height,
      });
    });
  }

  // Stack additional software→vuln chains below the primary row
  const chainRows = groupAttackChains(boxes, edges, nodeMap);
  if (chainRows.length > 1) {
    let rowOffset = 0;
    for (let r = 1; r < chainRows.length; r++) {
      const prevIds = chainRows[r - 1];
      const currIds = chainRows[r];
      const prevMaxY = Math.max(
        ...prevIds.map((id) => {
          const b = boxes.find((x) => x.id === id);
          return b ? b.y + b.height : 0;
        }),
      );
      const currMinY = Math.min(
        ...currIds.map((id) => boxes.find((x) => x.id === id)?.y ?? Infinity),
      );
      rowOffset = prevMaxY + LAYOUT.chainGap - currMinY;
      for (const id of currIds) {
        const b = boxes.find((x) => x.id === id);
        if (b) b.y += rowOffset;
      }
      for (const id of currIds) {
        const secItems = secondaryByParent.get(id) || [];
        secItems.forEach((s) => {
          const b = boxes.find((x) => x.id === s.id);
          if (b) b.y += rowOffset;
        });
      }
    }
  }

  // Normalize Y — shift so top margin is respected
  if (boxes.length) {
    const minY = Math.min(...boxes.map((b) => b.y));
    const shift = LAYOUT.marginTop - minY;
    if (shift > 0) boxes.forEach((b) => { b.y += shift; });
  }

  const positions = new Map<string, LayoutNodeMeta>();
  let maxX = 0;
  let maxY = 0;

  for (const box of boxes) {
    const node = nodeMap.get(box.id);
    const secondary = secondaryIds.has(box.id);
    const t = node ? normalizeType(node) : "unknown";
    const wave = secondary ? ANIMATION_WAVE.secondary : (ANIMATION_WAVE[t] ?? 2);
    const idx = waveCounters.get(wave) ?? 0;
    waveCounters.set(wave, idx + 1);

    positions.set(box.id, {
      x: box.x,
      y: box.y,
      column: box.column,
      secondary,
      animationWave: wave,
      animationIndex: idx,
      width: box.width,
      height: box.height,
    });
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }

  return {
    positions,
    bounds: {
      width: maxX + LAYOUT.marginRight,
      height: maxY + LAYOUT.marginBottom,
    },
  };
}

export function normalizeGraphType(node: GraphNode): string {
  return normalizeType(node);
}

export function isSecondaryGraphNode(node: GraphNode): boolean {
  return isSecondaryEvidence(node);
}
