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
import { GraphNode } from "./GraphNode";
import { GraphNodeInspector } from "./GraphNodeInspector";
import { GraphSearchModal } from "./GraphSearchModal";
import { VayneEdge } from "./VayneEdge";
import { applyGraphFit, centerOnNode } from "./graphFit";
import { computeHighlightState, edgeKey } from "./graphHighlight";
import {
  applyServiceGrouping,
  detectServiceGroups,
  type ServiceGroup,
} from "./graphServiceGroups";
import { formatEdgeLabel, normalizeGraphType } from "./graphUtils";
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
}: {
  graph: GraphData;
  context?: GraphExplorerContext;
  layout: "default" | "inline" | "hero" | "workstation";
  embedded?: boolean;
}) {
  const isWorkstation = layout === "workstation";
  const isInline = layout === "inline";
  const isHero = layout === "hero";
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
  const nodes = grouped.nodes;
  const edges = grouped.edges;

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
            memberCount: group?.memberIds.length ?? 0,
            onToggle: isGroup ? () => toggleGroup(n.id) : undefined,
          },
          selected: focusId === n.id,
        };
      });

    const edgeGroups = new Map<string, GraphData["edges"][number][]>();
    for (const e of edges) {
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
      const onPath = highlight.chainEdgeIds.has(id);
      const dimmed = hasFocus && !onPath;

      flowEdges.push({
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
      });
    }

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
  ]);

  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) ?? null,
    [graph.nodes, selectedId],
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

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (!flowRef.current) return;
    centerOnNode(flowRef.current, node, 1.08);
  }, []);

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
      ? !hasGraphData
      : context && !context.hasPaths && context.emptyChecks?.length && !hasGraphData,
  );

  if (showEmptyState) {
    return (
      <div
        className={`vx-graph-explorer ${heightClass} border ${
          isWorkstation ? "border-vx-border bg-vx-app" : "border-white/10 bg-[#050505]"
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
        className={`vx-graph-explorer grid overflow-hidden border transition-[grid-template-columns] duration-300 ease-out ${heightClass} ${
          isWorkstation ? "border-vx-border bg-vx-app" : embedded ? "border-white/10 bg-[#050505]" : "border-white/10 bg-[#050505]"
        }`}
        style={{
          gridTemplateColumns: selectedNode ? "minmax(0,1fr) minmax(280px,33%)" : "minmax(0,1fr) 0fr",
        }}
      >
        <div ref={canvasRef} className="vx-graph-canvas relative min-w-0 overflow-hidden">
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
            minZoom={0.12}
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
        </div>

        <aside
          className={`min-w-0 overflow-hidden border-l border-white/10 bg-[#050505] transition-opacity duration-300 ${
            selectedNode ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-hidden={!selectedNode}
        >
          {selectedNode ? (
            <GraphNodeInspector
              node={selectedNode}
              graphNodes={graph.nodes}
              graphEdges={graph.edges}
              onClose={() => setSelectedId(null)}
            />
          ) : null}
        </aside>
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
}) {
  return <GraphCanvas {...props} layout={props.layout ?? "default"} />;
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
