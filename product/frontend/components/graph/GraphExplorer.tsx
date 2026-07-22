"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { GraphData, GraphNode as GraphNodeType, WorkbenchData } from "@/lib/types";
import { computeElkLayout } from "./elkLayout";
import { GraphCanvasBackground } from "./GraphCanvasBackground";
import { GraphEmptyState, type ReasoningCheck } from "./GraphEmptyState";
import { GraphGroupNode } from "./GraphGroupNode";
import { GraphLevelNav } from "./GraphLevelNav";
import { GraphMinimapRail } from "./GraphMinimapRail";
import { GraphNode } from "./GraphNode";
import { GraphNodeInspector } from "./GraphNodeInspector";
import { GraphSearchFilter, type GraphFilterId } from "./GraphSearchFilter";
import { GraphSearchModal } from "./GraphSearchModal";
import { VayneEdge } from "./VayneEdge";
import { bundleGraphEdges } from "./edgeBundling";
import { applyGraphFit, centerOnNode } from "./graphFit";
import { computeHighlightState, edgeKey } from "./graphHighlight";
import {
  applyServiceGrouping,
  detectServiceGroups,
  type ServiceGroup,
} from "./graphServiceGroups";
import { formatEdgeLabel, nodeMatchesSearch, normalizeGraphType } from "./graphUtils";
import { useProgressiveGraph } from "./useProgressiveGraph";
import { useGraphKeyboard } from "./useGraphKeyboard";

const nodeTypes = { vayne: GraphNode, group: GraphGroupNode };
const edgeTypes = { vayne: VayneEdge };

const TRANSLATE_EXTENT: [[number, number], [number, number]] = [
  [-100000, -100000],
  [100000, 100000],
];

export interface GraphExplorerContext {
  hasPaths: boolean;
  attackPaths: number;
  rejectedPaths: number;
  confidence: number | null;
  summary: string;
  emptyChecks: ReasoningCheck[];
}

function GraphCanvas({
  graph,
  context,
  layout,
  embedded,
  workbench,
  investigationId,
}: {
  graph: GraphData;
  context?: GraphExplorerContext;
  layout: "default" | "inline" | "hero" | "workstation";
  embedded?: boolean;
  workbench?: WorkbenchData;
  investigationId?: string;
}) {
  const isWorkstation = layout === "workstation";
  const isInline = layout === "inline";
  const isHero = layout === "hero";
  const plain = embedded || isWorkstation;
  const heightClass = isWorkstation
    ? "h-[560px] min-h-[520px]"
    : isHero
      ? "h-[680px] min-h-[620px]"
      : isInline
        ? "h-[520px] min-h-[460px]"
        : "h-[720px] min-h-[640px]";

  const canvasRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const { zoomIn, zoomOut } = useReactFlow();
  const [flowReady, setFlowReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHighlightId, setSearchHighlightId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<GraphFilterId>>(() => new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [layoutPositions, setLayoutPositions] = useState<
    Map<string, { x: number; y: number; width: number; height: number }>
  >(new Map());
  const [layoutLoading, setLayoutLoading] = useState(true);

  const filters = useMemo(
    () => ({
      critical: activeFilters.has("critical"),
      exploitable: activeFilters.has("exploitable"),
      internet: activeFilters.has("internet"),
      lateral: activeFilters.has("lateral"),
    }),
    [activeFilters],
  );

  const progressive = useProgressiveGraph({
    investigationId,
    graph,
    workbench,
    filters,
  });

  const sourceGraph = progressive.progressiveEnabled ? progressive.visibleGraph : graph;

  const serviceGroups = useMemo(
    () => (progressive.progressiveEnabled ? [] : detectServiceGroups(sourceGraph.nodes)),
    [sourceGraph.nodes, progressive.progressiveEnabled],
  );

  const grouped = useMemo(
    () =>
      progressive.progressiveEnabled
        ? { nodes: sourceGraph.nodes, edges: sourceGraph.edges, hiddenNodeIds: new Set<string>(), memberToGroup: new Map() }
        : applyServiceGrouping(sourceGraph.nodes, sourceGraph.edges, serviceGroups, expandedGroups),
    [sourceGraph, serviceGroups, expandedGroups, progressive.progressiveEnabled],
  );

  const filteredNodes = useMemo(() => {
    let nodes = grouped.nodes;
    if (searchQuery.trim()) {
      nodes = nodes.filter((n) => nodeMatchesSearch(n, searchQuery));
    }
    if (activeFilters.has("critical")) {
      nodes = nodes.filter((n) => (n.risk ?? 0) >= 7);
    }
    if (activeFilters.has("exploitable")) {
      nodes = nodes.filter((n) => {
        const t = normalizeGraphType(n);
        return ["vulnerability", "attack_path", "cve_cluster", "investigation_cluster"].includes(t) || (n.risk ?? 0) >= 6;
      });
    }
    return nodes;
  }, [grouped.nodes, searchQuery, activeFilters]);

  const visibleIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const bundledEdges = useMemo(
    () => bundleGraphEdges(grouped.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))),
    [grouped.edges, visibleIds],
  );

  const nodes = filteredNodes;
  const edges = bundledEdges;

  useEffect(() => {
    let cancelled = false;
    setLayoutLoading(true);
    computeElkLayout(nodes, edges).then((positions) => {
      if (!cancelled) {
        setLayoutPositions(positions);
        setLayoutLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [nodes, edges]);

  const edgeIdByKey = useMemo(() => {
    const map = new Map<string, string>();
    edges.forEach((e, i) => map.set(edgeKey(e.source, e.target), `e-${e.source}-${e.target}-${i}`));
    return map;
  }, [edges]);

  const highlight = useMemo(
    () => computeHighlightState(selectedId ?? searchHighlightId, edges, edgeIdByKey),
    [selectedId, searchHighlightId, edges, edgeIdByKey],
  );

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const toggleFilter = useCallback((id: GraphFilterId) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const groupById = useMemo(() => {
    const map = new Map<string, ServiceGroup>();
    serviceGroups.forEach((g) => map.set(g.id, g));
    return map;
  }, [serviceGroups]);

  const { flowNodes, flowEdges } = useMemo(() => {
    const focusId = selectedId ?? searchHighlightId;
    const hasFocus = Boolean(focusId);

    const flowNodes: Node[] = nodes
      .filter((n) => layoutPositions.has(n.id))
      .map((n) => {
        const pos = layoutPositions.get(n.id)!;
        const nodeType = normalizeGraphType(n);
        const isGroup = nodeType === "group";
        const group = isGroup ? groupById.get(n.id) : undefined;
        const onPath = hasFocus ? highlight.chainIds.has(n.id) : true;
        const dimmed = hasFocus && !onPath;
        const childCount = Number((n as GraphNodeType & { child_count?: number }).child_count ?? group?.memberIds.length ?? 0);

        return {
          id: n.id,
          type: isGroup ? "group" : "vayne",
          position: { x: pos.x, y: pos.y },
          data: {
            ...n,
            type: nodeType,
            dimmed,
            highlighted: focusId === n.id,
            onChain: onPath,
            expanded: expandedGroups.has(n.id),
            memberCount: childCount,
            onToggle: isGroup
              ? () => {
                  if (progressive.progressiveEnabled) {
                    progressive.expandNode(n);
                  } else {
                    toggleGroup(n.id);
                  }
                }
              : undefined,
          },
          selected: focusId === n.id,
        };
      });

    const flowEdges: Edge[] = edges.map((e, i) => {
      const rel = formatEdgeLabel(e);
      const count = Number(e.bundle_count ?? 1);
      const displayLabel = count > 1 ? `${rel} ×${count}` : rel;
      const id = edgeIdByKey.get(edgeKey(e.source, e.target)) ?? `e-${i}`;
      const onPath = highlight.chainEdgeIds.has(id);
      const dimmed = hasFocus && !onPath;

      return {
        id,
        source: e.source,
        target: e.target,
        type: "vayne",
        data: {
          ...e,
          relationship: rel,
          displayLabel,
          dimmed,
          highlighted: onPath,
          highlightRole: onPath ? "chain" : undefined,
        },
      };
    });

    return { flowNodes, flowEdges };
  }, [
    nodes,
    edges,
    layoutPositions,
    selectedId,
    searchHighlightId,
    highlight,
    expandedGroups,
    groupById,
    toggleGroup,
    edgeIdByKey,
    progressive,
  ]);

  const selectedNode = useMemo(
    () => sourceGraph.nodes.find((n) => n.id === selectedId) ?? graph.nodes.find((n) => n.id === selectedId) ?? null,
    [sourceGraph.nodes, graph.nodes, selectedId],
  );

  const fitGraph = useCallback(() => {
    if (!flowRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    applyGraphFit(flowRef.current, flowNodes, { width: rect.width, height: rect.height });
  }, [flowNodes]);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    flowRef.current = instance;
    setFlowReady(true);
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedId(node.id);
    setSearchHighlightId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedId(null);
    setSearchHighlightId(null);
  }, []);

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (progressive.progressiveEnabled) {
        const raw = sourceGraph.nodes.find((n) => n.id === node.id);
        if (raw) progressive.expandNode(raw);
        return;
      }
      if (!flowRef.current) return;
      centerOnNode(flowRef.current, node, 1.08);
    },
    [progressive, sourceGraph.nodes],
  );

  const jumpToNode = useCallback(
    (nodeId: string) => {
      setSelectedId(nodeId);
      setSearchHighlightId(nodeId);
      const node = flowNodes.find((n) => n.id === nodeId);
      if (node && flowRef.current) centerOnNode(flowRef.current, node, 1.05);
    },
    [flowNodes],
  );

  useGraphKeyboard({
    enabled: flowReady && !layoutLoading,
    onClearSelection: onPaneClick,
    onOpenSearch: () => setSearchOpen(true),
    onFit: fitGraph,
    onZoomIn: () => zoomIn({ duration: 180 }),
    onZoomOut: () => zoomOut({ duration: 180 }),
  });

  useEffect(() => {
    if (!flowRef.current || !flowNodes.length || !canvasRef.current || layoutLoading || !flowReady) return;
    const t = window.setTimeout(fitGraph, 80);
    return () => window.clearTimeout(t);
  }, [flowNodes, flowReady, layoutLoading, fitGraph]);

  useEffect(() => {
    if (!canvasRef.current || !flowReady || layoutLoading) return;
    const ro = new ResizeObserver(() => {
      window.requestAnimationFrame(() => fitGraph());
    });
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [flowReady, layoutLoading, fitGraph]);

  const hasGraphData = nodes.length > 0;
  const showEmptyState = Boolean(
    isWorkstation
      ? !hasGraphData && !progressive.loading
      : context && !context.hasPaths && context.emptyChecks?.length && !hasGraphData && !progressive.loading,
  );

  if (showEmptyState) {
    return (
      <div
        className={`vx-graph-explorer ${heightClass} ${
          plain ? "bg-vx-app" : isWorkstation ? "border border-vx-border bg-vx-app" : "border border-white/10 bg-[#050505]"
        }`}
      >
        <GraphEmptyState
          checks={
            context?.emptyChecks?.length
              ? context.emptyChecks
              : [{ label: "Graph nodes not available yet", ok: false }]
          }
        />
      </div>
    );
  }

  return (
    <>
      <GraphSearchModal
        open={searchOpen}
        nodes={nodes}
        onClose={() => setSearchOpen(false)}
        onSelect={jumpToNode}
      />

      <div
        className={`vx-graph-explorer flex flex-col overflow-hidden ${heightClass} ${
          plain
            ? "bg-vx-app"
            : isWorkstation
              ? "border border-vx-border bg-vx-app"
              : embedded
                ? "border border-white/10 bg-[#050505]"
                : "border border-white/10 bg-[#050505]"
        }`}
      >
        <div ref={canvasRef} className="vx-graph-canvas relative min-h-0 flex-1 overflow-hidden transition-[flex-grow] duration-300 ease-out">
          {!plain ? (
            <GraphSearchFilter
              query={searchQuery}
              onQueryChange={setSearchQuery}
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              matchCount={nodes.length}
              totalCount={grouped.nodes.length}
            />
          ) : null}

          <GraphCanvasBackground />
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={onInit}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onPaneClick={onPaneClick}
            minZoom={0.04}
            maxZoom={2.5}
            translateExtent={TRANSLATE_EXTENT}
            panOnDrag
            panOnScroll={false}
            zoomOnScroll
            zoomOnPinch
            zoomOnDoubleClick={false}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onlyRenderVisibleElements
            proOptions={{ hideAttribution: true }}
            className="!bg-transparent"
            style={{ width: "100%", height: "100%" }}
          >
            {!plain ? <GraphMinimapRail /> : null}
            <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden>
              <defs>
                <marker id="vayne-arrow-default" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
                  <path d="M1,1 L9,5 L1,9 Z" fill="#52525b" />
                </marker>
                <marker id="vayne-arrow-valid" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
                  <path d="M1,1 L9,5 L1,9 Z" fill="#f4f4f5" />
                </marker>
              </defs>
            </svg>
          </ReactFlow>

          {progressive.progressiveEnabled && !plain ? (
            <GraphLevelNav
              stack={progressive.stack}
              onNavigate={progressive.navigateTo}
              visibleCount={progressive.statistics?.visible_nodes ?? nodes.length}
              hiddenCount={progressive.statistics?.hidden_nodes}
              loading={progressive.loading}
            />
          ) : null}
        </div>

        {!plain ? (
          <div
            className={`shrink-0 overflow-hidden border-white/10 bg-[#050505] transition-all duration-300 ease-out ${
              selectedNode ? "max-h-[280px] border-t opacity-100" : "max-h-0 border-t-0 opacity-0"
            }`}
            aria-hidden={!selectedNode}
          >
            {selectedNode ? (
              <GraphNodeInspector
                node={selectedNode}
                graphNodes={sourceGraph.nodes}
                graphEdges={sourceGraph.edges}
                onClose={() => setSelectedId(null)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

function GraphExplorerInner(props: {
  graph: GraphData;
  context?: GraphExplorerContext;
  embedded?: boolean;
  layout?: "default" | "inline" | "hero" | "workstation";
  workbench?: WorkbenchData;
  investigationId?: string;
}) {
  return <GraphCanvas {...props} layout={props.layout ?? "default"} />;
}

export function GraphExplorer({
  graph,
  context,
  embedded,
  layout = "default",
  workbench,
  investigationId,
}: {
  graph: GraphData;
  context?: GraphExplorerContext;
  embedded?: boolean;
  layout?: "default" | "inline" | "hero" | "workstation";
  workbench?: WorkbenchData;
  investigationId?: string;
}) {
  return (
    <ReactFlowProvider>
      <GraphExplorerInner
        graph={graph}
        context={context}
        embedded={embedded}
        layout={layout}
        workbench={workbench}
        investigationId={investigationId}
      />
    </ReactFlowProvider>
  );
}
