import type { GraphEdge } from "@/lib/types";
import { isValidatedEdge } from "./graphUtils";

export interface GraphHighlightState {
  selectedId: string | null;
  chainIds: Set<string>;
  incomingEdgeIds: Set<string>;
  outgoingEdgeIds: Set<string>;
  chainEdgeIds: Set<string>;
}

export function edgeKey(source: string, target: string): string {
  return `${source}::${target}`;
}

export function computeHighlightState(
  selectedId: string | null,
  edges: GraphEdge[],
  edgeIdByKey: Map<string, string>,
): GraphHighlightState {
  const empty: GraphHighlightState = {
    selectedId,
    chainIds: new Set(),
    incomingEdgeIds: new Set(),
    outgoingEdgeIds: new Set(),
    chainEdgeIds: new Set(),
  };
  if (!selectedId) return empty;

  const validated = edges.filter(isValidatedEdge);
  const incoming = new Set<string>();
  const outgoing = new Set<string>();
  const chainIds = new Set<string>([selectedId]);
  const chainEdgeIds = new Set<string>();
  const incomingEdgeIds = new Set<string>();
  const outgoingEdgeIds = new Set<string>();

  for (const e of validated) {
    const id = edgeIdByKey.get(edgeKey(e.source, e.target));
    if (!id) continue;
    if (e.target === selectedId) {
      incoming.add(e.source);
      incomingEdgeIds.add(id);
    }
    if (e.source === selectedId) {
      outgoing.add(e.target);
      outgoingEdgeIds.add(id);
    }
  }

  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  for (const e of validated) {
    if (!forward.has(e.source)) forward.set(e.source, []);
    forward.get(e.source)!.push(e.target);
    if (!backward.has(e.target)) backward.set(e.target, []);
    backward.get(e.target)!.push(e.source);
  }

  const bfs = (start: string, adj: Map<string, string[]>) => {
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const next of adj.get(cur) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return seen;
  };

  const upstream = bfs(selectedId, backward);
  const downstream = bfs(selectedId, forward);
  upstream.forEach((id) => chainIds.add(id));
  downstream.forEach((id) => chainIds.add(id));

  for (const e of validated) {
    if (chainIds.has(e.source) && chainIds.has(e.target)) {
      const id = edgeIdByKey.get(edgeKey(e.source, e.target));
      if (id) chainEdgeIds.add(id);
    }
  }

  return {
    selectedId,
    chainIds,
    incomingEdgeIds,
    outgoingEdgeIds,
    chainEdgeIds,
  };
}
