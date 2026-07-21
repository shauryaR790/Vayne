/** Bundle parallel edges between the same source/target for cleaner ELK layout. */

import type { GraphEdge } from "@/lib/types";

export interface BundledEdge extends GraphEdge {
  bundle_count: number;
  bundled_ids: string[];
}

export function bundleGraphEdges(edges: GraphEdge[]): BundledEdge[] {
  const groups = new Map<string, GraphEdge[]>();

  for (const edge of edges) {
    const rel = String(edge.relationship ?? "linked").toLowerCase();
    const key = `${edge.source}::${edge.target}::${rel}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(edge);
  }

  const bundled: BundledEdge[] = [];
  for (const [, group] of groups) {
    const primary = group[0];
    const count = group.length;
    bundled.push({
      ...primary,
      bundle_count: count,
      bundled_ids: group.map((_, i) => `${primary.source}-${primary.target}-${i}`),
      confidence: Math.max(...group.map((e) => Number(e.confidence ?? 0))),
    });
  }

  return bundled;
}
