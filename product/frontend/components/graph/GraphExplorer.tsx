"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphData, GraphNode as GraphNodeType } from "@/lib/types";
import { GraphNode } from "./GraphNode";
import { VayneEdge } from "./VayneEdge";
import { GraphCanvasBackground } from "./GraphCanvasBackground";
import { GraphNodeInspector } from "./GraphNodeInspector";
import { GraphEmptyState, type ReasoningCheck } from "./GraphEmptyState";
import { useGraphAnimations } from "./useGraphAnimations";
import { computeGraphLayout, normalizeGraphType } from "./layoutEngine";
import { applyGraphFit, FIT_MAX_ZOOM, FIT_MIN_ZOOM, FIT_PADDING } from "./graphFit";

const nodeTypes = { vayne: GraphNode };
const edgeTypes = { vayne: VayneEdge };

const STORY_COLUMNS = ["Internet", "Asset", "Service", "Vulnerability", "Privilege", "Target"];
const GRAPH_HEIGHT = "h-[640px]";

export interface GraphExplorerContext {
  hasPaths: boolean;
  attackPaths: number;
  rejectedPaths: number;
  confidence: number | null;
  summary: string;
  emptyChecks: ReasoningCheck[];
}

function normalizeNodeType(n: GraphNodeType): string {
  const raw = n as GraphNodeType & { node_type?: string };
  return n.type || raw.node_type || normalizeGraphType(n);
}

function isValidatedEdge(e: GraphData["edges"][number]): boolean {
  const rel = String(e.relationship ?? "").toLowerCase();
  const cat = String(e.category ?? "").toLowerCase();
  return !rel.includes("reject") && !cat.includes("reject");
}

function computeHighlightNodeIds(
  nodes: GraphNodeType[],
  edges: GraphData["edges"],
): Set<string> | undefined {
  const onPath = new Set<string>();
  for (const e of edges.filter(isValidatedEdge)) {
    onPath.add(e.source);
    onPath.add(e.target);
  }
  if (onPath.size === 0) {
    for (const n of nodes) {
      const t = normalizeNodeType(n).toLowerCase();
      if (
        ["endpoint", "asset", "service", "software", "vulnerability", "attack", "verified"].includes(
          t,
        )
      ) {
        onPath.add(n.id);
      }
    }
  }
  return onPath.size > 0 ? onPath : undefined;
}

function buildFlowGraph(
  nodes: GraphNodeType[],
  edges: GraphData["edges"],
  highlightIds?: Set<string>,
): { flowNodes: Node[]; flowEdges: Edge[] } {
  const layout = computeGraphLayout(nodes, edges);
  const visibleIds = new Set(nodes.map((n) => n.id));

  const flowNodes: Node[] = nodes
    .filter((n) => layout.positions.has(n.id))
    .map((n) => {
      const pos = layout.positions.get(n.id)!;
      const nodeType = normalizeNodeType(n);
      return {
        id: n.id,
        type: "vayne",
        position: { x: pos.x, y: pos.y },
        data: {
          ...n,
          type: nodeType,
          secondary: pos.secondary,
          animationWave: pos.animationWave,
          animationIndex: pos.animationIndex,
          dimmed: highlightIds ? !highlightIds.has(n.id) : false,
          onPath: highlightIds ? highlightIds.has(n.id) : false,
        },
      };
    });

  const edgeGroups = new Map<string, GraphData["edges"][number][]>();
  for (const e of edges) {
    if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) continue;
    const key = `${e.source}::${e.target}`;
    if (!edgeGroups.has(key)) edgeGroups.set(key, []);
    edgeGroups.get(key)!.push(e);
  }

  const flowEdges: Edge[] = [];
  let i = 0;
  for (const [, group] of edgeGroups) {
    const e = group[0];
    const rel = e.relationship?.replace(/_/g, " ") || "linked";
    const count = group.length;
    const allSameRel = group.every((g) => g.relationship === e.relationship);
    const displayLabel = count > 1 && allSameRel ? `${count}× ${rel}` : rel;
    const rejected =
      String(e.category ?? "").toLowerCase().includes("reject") ||
      String(e.relationship ?? "").toLowerCase().includes("reject");

    const onPath =
      highlightIds != null && highlightIds.has(e.source) && highlightIds.has(e.target);

    flowEdges.push({
      id: `e-${e.source}-${e.target}-${i++}`,
      source: e.source,
      target: e.target,
      type: "vayne",
      data: {
        ...e,
        relationship: rel,
        displayLabel,
        edgeCount: count,
        validated: !rejected && (highlightIds == null || onPath),
        dimmed: highlightIds != null && !onPath,
      },
    });
  }

  return { flowNodes, flowEdges };
}

function GraphExplorerInner({
  graph,
  context,
  embedded = false,
  layout = "default",
  workbench,
}: {
  graph: GraphData;
  context?: GraphExplorerContext;
  embedded?: boolean;
  layout?: "default" | "inline" | "hero" | "workstation";
  workbench?: unknown;
}) {
  const isInline = layout === "inline";
  const isHero = layout === "hero";
  const isWorkstation = layout === "workstation";
  const isWide = isHero || isWorkstation;
  const scrollableEmbed = embedded || isWorkstation || isInline;
  const graphHeight = isWorkstation
    ? "h-[640px]"
    : isHero
      ? "h-[580px]"
      : isInline
        ? "h-[420px]"
        : GRAPH_HEIGHT;
  const minHeight = isWorkstation
    ? "min-h-[560px]"
    : isHero
      ? "min-h-[520px]"
      : isInline
        ? "min-h-[340px]"
        : "min-h-[560px]";
  const containerRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const [flowReady, setFlowReady] = useState(false);
  const [selected, setSelected] = useState<GraphNodeType | null>(null);

  const filteredNodes = useMemo(() => graph.nodes, [graph.nodes]);

  const nodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = graph.edges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  );

  const highlightIds = useMemo(
    () => (isWorkstation ? computeHighlightNodeIds(filteredNodes, filteredEdges) : undefined),
    [filteredNodes, filteredEdges, isWorkstation],
  );

  const { flowNodes, flowEdges } = useMemo(
    () => buildFlowGraph(filteredNodes, filteredEdges, highlightIds),
    [filteredNodes, filteredEdges, highlightIds],
  );

  const onInit = useCallback((instance: ReactFlowInstance) => {
    flowRef.current = instance;
    setFlowReady(true);
  }, []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelected(graph.nodes.find((n) => n.id === node.id) ?? null);
    },
    [graph.nodes],
  );

  useEffect(() => {
    if (!isWorkstation || selected || !graph.nodes.length) return;
    const pick =
      graph.nodes.find((n) => highlightIds?.has(n.id) && normalizeNodeType(n) === "vulnerability") ||
      graph.nodes.find((n) => highlightIds?.has(n.id)) ||
      graph.nodes[0];
    if (pick) setSelected(pick);
  }, [graph.nodes, highlightIds, isWorkstation, selected]);

  useGraphAnimations(containerRef, flowReady, flowNodes.length, { hero: isWide });

  useEffect(() => {
    if (!flowRef.current || !flowNodes.length || !containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    if (width < 32 || height < 32) return;
    const t = window.setTimeout(() => {
      applyGraphFit(flowRef.current!, flowNodes);
    }, 120);
    return () => window.clearTimeout(t);
  }, [flowNodes, flowReady]);

  useEffect(() => {
    if (!scrollableEmbed || !flowReady || !containerRef.current || !flowRef.current) return;

    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      if (!flowNodes.length || !flowRef.current) return;
      window.requestAnimationFrame(() => {
        flowRef.current?.fitView({
          nodes: flowNodes.filter((n) => !n.hidden),
          padding: FIT_PADDING,
          duration: 0,
          maxZoom: FIT_MAX_ZOOM,
          minZoom: FIT_MIN_ZOOM,
        });
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [flowNodes, flowReady, scrollableEmbed]);

  const showEmptyState = Boolean(context && !context.hasPaths && context.emptyChecks?.length);

  return (
    <div
      className={`grid min-w-0 grid-cols-1 items-stretch gap-px ${
        isWorkstation ? "" : isInline ? "" : isHero ? "xl:grid-cols-[minmax(0,1fr)_220px]" : "xl:grid-cols-[minmax(0,1fr)_240px]"
      }`}
    >
        <div
          ref={containerRef}
          className={`relative ${graphHeight} ${minHeight} isolate overflow-hidden min-w-0 ${
            isWorkstation ? "bg-vx-app border border-vx-border" : "bg-black"
          } ${
            isWorkstation
              ? ""
              : embedded || isWide
                ? "border border-white/[0.12] transition-[border-color] duration-300 hover:border-white/[0.22]"
                : "border border-white"
          }`}
        >
          {showEmptyState ? (
            <GraphEmptyState checks={context!.emptyChecks} />
          ) : (
            <>
              <GraphCanvasBackground />

              <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden>
                {STORY_COLUMNS.map((label, col) => (
                  <div
                    key={label}
                    className="absolute top-3 text-center text-[9px] font-bold uppercase tracking-[0.14em] text-white/25"
                    style={{
                      left: 60 + col * 280,
                      width: 240,
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>

              <div className="absolute inset-0 z-[2]">
                <ReactFlow
                  nodes={flowNodes}
                  edges={flowEdges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  onInit={onInit}
                  onNodeClick={onNodeClick}
                  defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                  minZoom={0.35}
                  maxZoom={2.5}
                  panOnDrag
                  panOnScroll={!scrollableEmbed}
                  zoomOnScroll={!scrollableEmbed}
                  preventScrolling={!scrollableEmbed}
                  zoomOnPinch
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable
                  proOptions={{ hideAttribution: true }}
                  className="!bg-transparent"
                  style={{ width: "100%", height: "100%" }}
                >
                <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden>
                  <defs>
                    <marker
                      id="vayne-arrow-default"
                      markerWidth="12"
                      markerHeight="12"
                      refX="10"
                      refY="6"
                      orient="auto"
                    >
                      <path d="M2,2 L10,6 L2,10 Z" fill="#52525b" />
                    </marker>
                    <marker
                      id="vayne-arrow-valid"
                      markerWidth="14"
                      markerHeight="14"
                      refX="11"
                      refY="7"
                      orient="auto"
                    >
                      <path d="M2,2 L12,7 L2,12 Z" fill="#a1a1aa" />
                    </marker>
                    <marker
                      id="vayne-arrow-reject"
                      markerWidth="12"
                      markerHeight="12"
                      refX="10"
                      refY="6"
                      orient="auto"
                    >
                      <path d="M2,2 L10,6 L2,10 Z" fill="#f97316" />
                    </marker>
                  </defs>
                </svg>
                </ReactFlow>
              </div>
            </>
          )}
        </div>

        <aside
          className={`flex ${
            isWorkstation ? "h-auto min-h-[220px] max-h-none" : isInline ? "h-auto max-h-[200px]" : graphHeight
          } ${isWorkstation || isInline ? "min-h-0" : minHeight} min-w-0 flex-col ${
            isWorkstation ? "bg-vx-section-body border border-vx-border" : "bg-black"
          } ${
            isWorkstation
              ? ""
              : embedded || isWide
                ? "border border-white/30"
                : "border border-white"
          }`}
        >
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <p className="text-[12px] font-bold uppercase tracking-[0.15em] text-vx-muted">
              Inspector
            </p>
            <GraphNodeInspector node={selected} />
          </div>
        </aside>
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
  workbench?: unknown;
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
