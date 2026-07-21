import { fetchJson } from "./api";
import type { GraphEdge, GraphNode } from "./types";

export interface ProgressiveGraphSlice {
  level: number;
  parent_id: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  breadcrumb: Array<{ id: string; label: string }>;
  statistics: Record<string, number>;
}

export async function getProgressiveGraph(
  investigationId: string,
  options?: {
    level?: number;
    parentId?: string;
    filters?: {
      critical?: boolean;
      exploitable?: boolean;
      internet?: boolean;
      lateral?: boolean;
    };
  },
): Promise<ProgressiveGraphSlice> {
  const params = new URLSearchParams();
  params.set("level", String(options?.level ?? 1));
  if (options?.parentId) params.set("parent_id", options.parentId);
  if (options?.filters?.critical) params.set("critical", "true");
  if (options?.filters?.exploitable) params.set("exploitable", "true");
  if (options?.filters?.internet) params.set("internet", "true");
  if (options?.filters?.lateral) params.set("lateral", "true");

  return fetchJson(`/api/investigation/${investigationId}/graph/progressive?${params.toString()}`);
}
