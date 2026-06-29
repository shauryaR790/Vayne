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
import { applyGraphFit } from "./graphFit";

const nodeTypes = { vayne: GraphNode };
const edgeTypes = { vayne: VayneEdge };

const COLUMN_LABELS = ["Entry", "Asset", "Services", "Software", "Vulnerability"];
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

function buildFlowGraph(
  nodes: GraphNodeType[],
  edges: GraphData["edges"],
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
        validated: !rejected,
      },
    });
  }

  return { flowNodes, flowEdges };
}

function GraphExplorerInner({
  graph,
  context,
  embedded = false,
}: {
  graph: GraphData;
  context?: GraphExplorerContext;
  embedded?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const [flowReady, setFlowReady] = useState(false);
  const [selected, setSelected] = useState<GraphNodeType | null>(null);

  const filteredNodes = useMemo(() => graph.nodes, [graph.nodes]);

  const nodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = graph.edges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  );

  const { flowNodes, flowEdges } = useMemo(
    () => buildFlowGraph(filteredNodes, filteredEdges),
    [filteredNodes, filteredEdges],
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

  useGraphAnimations(containerRef, flowReady);

  useEffect(() => {
    if (!flowRef.current || !flowNodes.length) return;
    const t = window.setTimeout(() => {
      applyGraphFit(flowRef.current!, flowNodes);
    }, 80);
    return () => window.clearTimeout(t);
  }, [flowNodes]);

  const showEmptyState = Boolean(context && !context.hasPaths && context.emptyChecks?.length);

  return (
    <div className="grid min-w-0 grid-cols-1 items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_240px]">
        <div
          ref={containerRef}
          className={`relative ${GRAPH_HEIGHT} min-h-[560px] overflow-hidden min-w-0 bg-black ${
            embedded ? "border-0" : "border border-white"
          }`}
        >
          {showEmptyState ? (
            <GraphEmptyState checks={context!.emptyChecks} />
          ) : (
            <>
              <GraphCanvasBackground />

              <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
                {COLUMN_LABELS.map((label, col) => (
                  <div
                    key={label}
                    className="absolute top-3 text-center text-[9px] font-bold uppercase tracking-[0.14em] text-white/20"
                    style={{
                      left: 60 + col * 280,
                      width: 240,
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>

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
                panOnScroll
                zoomOnScroll
                zoomOnPinch
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable
                proOptions={{ hideAttribution: true }}
                className="!bg-transparent"
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
            </>
          )}
        </div>

        <aside
          className={`flex ${GRAPH_HEIGHT} min-h-[560px] min-w-0 flex-col bg-black ${
            embedded ? "border-l border-white/20" : "border border-white"
          }`}
        >
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
              Selected Node
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
}: {
  graph: GraphData;
  context?: GraphExplorerContext;
  embedded?: boolean;
}) {
  return (
    <ReactFlowProvider>
      <GraphExplorerInner graph={graph} context={context} embedded={embedded} />
    </ReactFlowProvider>
  );
}
