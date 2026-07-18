"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { GraphData, GraphNode as GraphNodeType, WorkbenchData } from "@/lib/types";
import { computeElkLayout } from "./elkLayout";
import { GraphCanvasBackground } from "./GraphCanvasBackground";
import { GraphEmptyState, type ReasoningCheck } from "./GraphEmptyState";
import { GraphExplorerChrome, type GraphFilterId } from "./GraphExplorerChrome";
import { GraphGroupNode } from "./GraphGroupNode";
import { GraphMinimapRail } from "./GraphMinimapRail";
import { GraphNode } from "./GraphNode";
import { GraphNodeInspector } from "./GraphNodeInspector";
import { VayneEdge } from "./VayneEdge";
import { applyGraphFit, FIT_MAX_ZOOM, FIT_MIN_ZOOM, FIT_PADDING } from "./graphFit";
import { computeHighlightState, edgeKey } from "./graphHighlight";
import {
  applyServiceGrouping,
  detectServiceGroups,
  type ServiceGroup,
} from "./graphServiceGroups";
import {
  formatEdgeLabel,
  isCriticalNode,
  isExploitableNode,
  isInternetFacingNode,
  isLateralMovementNode,
  nodeMatchesSearch,
  normalizeGraphType,
} from "./graphUtils";

const nodeTypes = { vayne: GraphNode, group: GraphGroupNode };
const edgeTypes = { vayne: VayneEdge };

const GRAPH_HEIGHT = "h-[680px]";
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

function filterGraphNodes(
  nodes: GraphNodeType[],
  edges: GraphData["edges"],
  filters: Set<GraphFilterId>,
): GraphNodeType[] {
  if (!filters.size) return nodes;
  return nodes.filter((node) => {
    if (filters.has("critical") && !isCriticalNode(node)) return false;
    if (filters.has("exploitable") && !isExploitableNode(node, edges)) return false;
    if (filters.has("internet") && !isInternetFacingNode(node, edges)) return false;
    if (filters.has("lateral") && !isLateralMovementNode(node, edges)) return false;
    return true;
  });
}

function GraphExplorerInner({
  graph,
  context,
  embedded = false,
  layout = "default",
}: {
  graph: GraphData;
  context?: GraphExplorerContext;
  embedded?: boolean;
  layout?: "default" | "inline" | "hero" | "workstation";
  workbench?: WorkbenchData;
}) {
  const isInline = layout === "inline";
  const isHero = layout === "hero";
  const isWorkstation = layout === "workstation";
  const isWide = isHero || isWorkstation;
  const graphHeight = isWorkstation
    ? "h-[520px]"
    : isHero
      ? "h-[620px]"
      : isInline
        ? "h-[460px]"
        : GRAPH_HEIGHT;
  const minHeight = isWorkstation
    ? "min-h-[480px]"
    : isHero
      ? "min-h-[560px]"
      : isInline
        ? "min-h-[380px]"
        : "min-h-[600px]";

  const canvasRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const [flowReady, setFlowReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<GraphFilterId>>(() => new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [layoutPositions, setLayoutPositions] = useState<
    Map<string, { x: number; y: number; width: number; height: number }>
  >(new Map());
  const [layoutLoading, setLayoutLoading] = useState(true);

  const serviceGroups = useMemo(() => detectServiceGroups(graph.nodes), [graph.nodes]);

  const grouped = useMemo(
    () => applyServiceGrouping(graph.nodes, graph.edges, serviceGroups, expandedGroups),
    [graph.nodes, graph.edges, serviceGroups, expandedGroups],
  );

  const filteredByChip = useMemo(
    () => filterGraphNodes(grouped.nodes, grouped.edges, activeFilters),
    [grouped.nodes, grouped.edges, activeFilters],
  );

  const visibleNodeIds = useMemo(() => new Set(filteredByChip.map((n) => n.id)), [filteredByChip]);

  const filteredEdges = useMemo(
    () =>
      grouped.edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)),
    [grouped.edges, visibleNodeIds],
  );

  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const matches = new Set<string>();
    for (const node of filteredByChip) {
      if (nodeMatchesSearch(node, searchQuery)) matches.add(node.id);
    }
    if (!matches.size) return matches;
    const expanded = new Set(matches);
    for (const edge of filteredEdges) {
      if (matches.has(edge.source) || matches.has(edge.target)) {
        expanded.add(edge.source);
        expanded.add(edge.target);
      }
    }
    return expanded;
  }, [filteredByChip, filteredEdges, searchQuery]);

  useEffect(() => {
    let cancelled = false;
    setLayoutLoading(true);
    computeElkLayout(filteredByChip, filteredEdges).then((positions) => {
      if (!cancelled) {
        setLayoutPositions(positions);
        setLayoutLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filteredByChip, filteredEdges]);

  const edgeIdByKey = useMemo(() => {
    const map = new Map<string, string>();
    filteredEdges.forEach((e, i) => {
      map.set(edgeKey(e.source, e.target), `e-${e.source}-${e.target}-${i}`);
    });
    return map;
  }, [filteredEdges]);

  const highlight = useMemo(
    () => computeHighlightState(selectedId, filteredEdges, edgeIdByKey),
    [selectedId, filteredEdges, edgeIdByKey],
  );

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const groupById = useMemo(() => {
    const map = new Map<string, ServiceGroup>();
    serviceGroups.forEach((g) => map.set(g.id, g));
    return map;
  }, [serviceGroups]);

  const { flowNodes, flowEdges } = useMemo(() => {
    const hasSelection = Boolean(selectedId);
    const hasSearch = Boolean(searchMatchIds?.size);

    const flowNodes: Node[] = filteredByChip
      .filter((n) => layoutPositions.has(n.id))
      .map((n) => {
        const pos = layoutPositions.get(n.id)!;
        const nodeType = normalizeGraphType(n);
        const isGroup = nodeType === "group";
        const group = isGroup ? groupById.get(n.id) : undefined;
        const inHighlight = hasSelection ? highlight.chainIds.has(n.id) : true;
        const inSearch = hasSearch ? searchMatchIds!.has(n.id) : true;
        const dimmed = (hasSelection && !inHighlight) || (hasSearch && !inSearch);

        return {
          id: n.id,
          type: isGroup ? "group" : "vayne",
          position: { x: pos.x, y: pos.y },
          data: {
            ...n,
            type: nodeType,
            dimmed,
            highlighted: selectedId === n.id,
            onChain: highlight.chainIds.has(n.id),
            expanded: expandedGroups.has(n.id),
            memberCount: group?.memberIds.length ?? 0,
            onToggle: isGroup ? () => toggleGroup(n.id) : undefined,
          },
          selected: selectedId === n.id,
        };
      });

    const edgeGroups = new Map<string, GraphData["edges"][number][]>();
    for (const e of filteredEdges) {
      const key = `${e.source}::${e.target}`;
      if (!edgeGroups.has(key)) edgeGroups.set(key, []);
      edgeGroups.get(key)!.push(e);
    }

    const flowEdges: Edge[] = [];
    let i = 0;
    for (const [, group] of edgeGroups) {
      const e = group[0];
      const rel = formatEdgeLabel(e);
      const count = group.length;
      const allSameRel = group.every((g) => g.relationship === e.relationship);
      const displayLabel = count > 1 && allSameRel ? `${rel} ×${count}` : rel;
      const id = edgeIdByKey.get(edgeKey(e.source, e.target)) ?? `e-${i++}`;
      const onChain = highlight.chainEdgeIds.has(id);
      const incoming = highlight.incomingEdgeIds.has(id);
      const outgoing = highlight.outgoingEdgeIds.has(id);
      const dimmed = hasSelection && !onChain && !incoming && !outgoing;

      flowEdges.push({
        id,
        source: e.source,
        target: e.target,
        type: "vayne",
        data: {
          ...e,
          relationship: rel,
          displayLabel,
          edgeCount: count,
          dimmed,
          highlighted: onChain || incoming || outgoing,
          highlightRole: incoming ? "incoming" : outgoing ? "outgoing" : onChain ? "chain" : undefined,
        },
      });
    }

    return { flowNodes, flowEdges };
  }, [
    filteredByChip,
    filteredEdges,
    layoutPositions,
    selectedId,
    highlight,
    searchMatchIds,
    expandedGroups,
    groupById,
    toggleGroup,
    edgeIdByKey,
  ]);

  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) ?? null,
    [graph.nodes, selectedId],
  );

  const onInit = useCallback((instance: ReactFlowInstance) => {
    flowRef.current = instance;
    setFlowReady(true);
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedId(null);
  }, []);

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    const instance = flowRef.current;
    if (!instance) return;
    const width = Number(node.width ?? 170);
    const height = Number(node.height ?? 80);
    instance.setCenter(node.position.x + width / 2, node.position.y + height / 2, {
      zoom: 1,
      duration: 450,
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

  useEffect(() => {
    if (!flowRef.current || !flowNodes.length || !canvasRef.current || layoutLoading || !flowReady) return;
    const { width, height } = canvasRef.current.getBoundingClientRect();
    if (width < 32 || height < 32) return;
    const t = window.setTimeout(() => {
      applyGraphFit(flowRef.current!, flowNodes);
    }, 60);
    return () => window.clearTimeout(t);
  }, [flowNodes, flowReady, layoutLoading]);

  const hasGraphData = filteredByChip.length > 0;
  const showEmptyState = Boolean(
    isWorkstation
      ? !hasGraphData
      : context && !context.hasPaths && context.emptyChecks?.length && !hasGraphData,
  );

  const searchMatchCount = searchMatchIds?.size ?? filteredByChip.length;

  return (
    <div
      className={`grid min-w-0 grid-cols-1 items-stretch gap-px ${
        isWorkstation ? "" : isInline ? "" : isHero ? "xl:grid-cols-[minmax(0,1fr)_220px]" : "xl:grid-cols-[minmax(0,1fr)_240px]"
      }`}
    >
      <div
        className={`vx-graph-explorer flex min-w-0 flex-col ${graphHeight} ${minHeight} ${
          isWorkstation ? "border border-vx-border bg-vx-app" : "bg-[#050505]"
        } ${
          isWorkstation
            ? ""
            : embedded || isWide
              ? "border border-white/[0.12]"
              : "border border-white/20"
        }`}
      >
        {showEmptyState ? (
          <GraphEmptyState
            checks={
              context?.emptyChecks?.length
                ? context.emptyChecks
                : [{ label: "Graph nodes not available yet", ok: false }]
            }
          />
        ) : (
          <>
            <GraphExplorerChrome
              query={searchQuery}
              onQueryChange={setSearchQuery}
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              matchCount={searchMatchCount}
              totalCount={filteredByChip.length}
              nodeCount={filteredByChip.length}
              edgeCount={filteredEdges.length}
              loading={layoutLoading}
            />

            <div className="relative min-h-0 flex-1 overflow-hidden">
              <div ref={canvasRef} className="absolute inset-0 right-[148px]">
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
                  defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
                  minZoom={0.08}
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
                  proOptions={{ hideAttribution: true }}
                  className="!bg-transparent"
                  style={{ width: "100%", height: "100%" }}
                >
                  <GraphMinimapRail />
                  <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden>
                    <defs>
                      <marker
                        id="vayne-arrow-default"
                        markerWidth="10"
                        markerHeight="10"
                        refX="8"
                        refY="5"
                        orient="auto"
                      >
                        <path d="M1,1 L9,5 L1,9 Z" fill="#71717a" />
                      </marker>
                      <marker
                        id="vayne-arrow-valid"
                        markerWidth="10"
                        markerHeight="10"
                        refX="8"
                        refY="5"
                        orient="auto"
                      >
                        <path d="M1,1 L9,5 L1,9 Z" fill="#e4e4e7" />
                      </marker>
                      <marker
                        id="vayne-arrow-reject"
                        markerWidth="10"
                        markerHeight="10"
                        refX="8"
                        refY="5"
                        orient="auto"
                      >
                        <path d="M1,1 L9,5 L1,9 Z" fill="#f97316" />
                      </marker>
                    </defs>
                  </svg>
                </ReactFlow>
              </div>
            </div>
          </>
        )}
      </div>

      {!isWorkstation ? (
        <aside
          className={`flex ${
            isInline ? "h-auto max-h-[200px]" : graphHeight
          } ${isInline ? "min-h-0" : minHeight} min-w-0 flex-col bg-[#050505] ${
            embedded || isWide ? "border border-white/30" : "border border-white/20"
          }`}
        >
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <p className="text-[12px] font-bold uppercase tracking-[0.15em] text-vx-muted">
              Inspector
            </p>
            <GraphNodeInspector node={selectedNode} />
          </div>
        </aside>
      ) : null}
    </div>
  );
}

export function GraphExplorer({
  graph,
  context,
  embedded,
  layout = "default",
  workbench,
}: {
  graph: GraphData;
  context?: GraphExplorerContext;
  embedded?: boolean;
  layout?: "default" | "inline" | "hero" | "workstation";
  workbench?: WorkbenchData;
}) {
  return (
    <ReactFlowProvider>
      <GraphExplorerInner
        graph={graph}
        context={context}
        embedded={embedded}
        layout={layout}
        workbench={workbench}
      />
    </ReactFlowProvider>
  );
}
