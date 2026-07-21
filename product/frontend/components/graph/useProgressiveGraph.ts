"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getProgressiveGraph, type ProgressiveGraphSlice } from "@/lib/progressiveGraph";
import type { GraphData, GraphEdge, GraphNode, WorkbenchData } from "@/lib/types";

export type GraphLevel = 1 | 2 | 3 | 4;

export interface GraphBreadcrumb {
  id: string;
  label: string;
  level: GraphLevel;
  parentId: string | null;
}

export interface ProgressiveGraphFilters {
  critical?: boolean;
  exploitable?: boolean;
  internet?: boolean;
  lateral?: boolean;
}

const LEVEL_LABELS: Record<GraphLevel, string> = {
  1: "Investigations",
  2: "Assets",
  3: "Evidence",
  4: "Attack paths",
};

function level1FromWorkbench(workbench: WorkbenchData): ProgressiveGraphSlice {
  const investigations = workbench.investigations?.length
    ? workbench.investigations
    : workbench.priority_queue ?? [];

  const nodes: GraphNode[] = investigations.map((inv) => ({
    id: `cluster:${inv.id}`,
    label: inv.title,
    type: "investigation_cluster",
    risk: inv.risk_score / 10,
    confidence: inv.confidence,
    evidence: inv.reason ? [inv.reason] : [],
    group: inv.cluster_type,
  }));

  return {
    level: 1,
    parent_id: null,
    nodes,
    edges: [],
    breadcrumb: [{ id: "root", label: "Investigations" }],
    statistics: {
      total_nodes: workbench.totals?.confirmed_findings ?? nodes.length,
      visible_nodes: nodes.length,
      hidden_nodes: Math.max(0, (workbench.totals?.confirmed_findings ?? 0) - nodes.length),
    },
  };
}

export function useProgressiveGraph({
  investigationId,
  graph,
  workbench,
  filters,
}: {
  investigationId?: string;
  graph: GraphData;
  workbench?: WorkbenchData | null;
  filters?: ProgressiveGraphFilters;
}) {
  const progressiveEnabled = Boolean(
    workbench?.investigations?.length || workbench?.priority_queue?.length,
  );

  const [slice, setSlice] = useState<ProgressiveGraphSlice | null>(null);
  const [loading, setLoading] = useState(false);
  const [stack, setStack] = useState<GraphBreadcrumb[]>([
    { id: "root", label: "Investigations", level: 1, parentId: null },
  ]);

  const current = stack[stack.length - 1];
  const filterKey = JSON.stringify(filters ?? {});

  const loadSlice = useCallback(
    async (level: GraphLevel, parentId: string | null) => {
      if (!progressiveEnabled) return;

      setLoading(true);
      try {
        if (investigationId) {
          const data = await getProgressiveGraph(investigationId, {
            level,
            parentId: parentId ?? undefined,
            filters,
          });
          setSlice(data);
          return;
        }
        if (workbench && level === 1 && !parentId) {
          setSlice(level1FromWorkbench(workbench));
        }
      } catch {
        if (workbench && level === 1) {
          setSlice(level1FromWorkbench(workbench));
        }
      } finally {
        setLoading(false);
      }
    },
    [investigationId, workbench, filters, progressiveEnabled],
  );

  useEffect(() => {
    if (!progressiveEnabled) {
      setSlice(null);
      return;
    }
    void loadSlice(current.level, current.parentId);
  }, [progressiveEnabled, current.level, current.parentId, filterKey, loadSlice]);

  const expandNode = useCallback(
    (node: GraphNode) => {
      const nodeType = (node.type || "").toLowerCase();
      let nextLevel = (current.level + 1) as GraphLevel;
      if (nodeType === "investigation_cluster") nextLevel = 2;
      else if (nodeType === "asset" || nodeType === "subnet_cluster") nextLevel = 3;
      else if (nodeType.includes("cluster") || nodeType === "service") nextLevel = 4;
      if (nextLevel > 4) return;

      setStack((prev) => [
        ...prev,
        {
          id: node.id,
          label: node.label,
          level: nextLevel,
          parentId: node.id,
        },
      ]);
    },
    [current.level],
  );

  const navigateTo = useCallback((index: number) => {
    setStack((prev) => prev.slice(0, index + 1));
  }, []);

  const resetToRoot = useCallback(() => {
    setStack([{ id: "root", label: "Investigations", level: 1, parentId: null }]);
  }, []);

  const visibleGraph: GraphData = useMemo(() => {
    if (!progressiveEnabled || !slice) return graph;
    return {
      nodes: slice.nodes as GraphNode[],
      edges: slice.edges as GraphEdge[],
      attack_paths: graph.attack_paths,
      statistics: { ...graph.statistics, ...slice.statistics },
    };
  }, [progressiveEnabled, slice, graph]);

  return {
    progressiveEnabled,
    visibleGraph,
    slice,
    loading,
    stack,
    levelLabel: LEVEL_LABELS[current.level],
    expandNode,
    navigateTo,
    resetToRoot,
    statistics: slice?.statistics,
  };
}
