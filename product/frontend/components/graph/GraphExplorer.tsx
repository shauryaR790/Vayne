"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  MarkerType,
  type Node,
  type Edge,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphData, GraphNode as GraphNodeType } from "@/lib/types";
import { SidePanel, StatRow } from "@/components/ui/Workstation";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { GraphNode } from "./GraphNode";
import { VayneEdge } from "./VayneEdge";
import { GraphCanvasBackground } from "./GraphCanvasBackground";
import { GraphToolbar, applyGraphFit } from "./GraphToolbar";
import { useGraphAnimations } from "./useGraphAnimations";
import { computeGraphLayout, normalizeGraphType } from "./layoutEngine";

const nodeTypes = { vayne: GraphNode };
const edgeTypes = { vayne: VayneEdge };

const COLUMN_LABELS = ["Entry", "Asset", "Services", "Software", "Vulnerability"];

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

  // Aggregate parallel edges (same source → target)
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

    flowEdges.push({
      id: `e-${e.source}-${e.target}-${i++}`,
      source: e.source,
      target: e.target,
      type: "vayne",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#52525b", width: 12, height: 12 },
      data: { ...e, relationship: rel, displayLabel, edgeCount: count },
    });
  }

  return { flowNodes, flowEdges };
}

function GraphExplorerInner({ graph }: { graph: GraphData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const [flowReady, setFlowReady] = useState(false);
  const [selected, setSelected] = useState<GraphNodeType | null>(null);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const categories = useMemo(() => {
    const set = new Set(graph.nodes.map((n) => n.category).filter(Boolean));
    return ["all", ...Array.from(set)] as string[];
  }, [graph.nodes]);

  const types = useMemo(() => {
    const set = new Set(graph.nodes.map((n) => normalizeNodeType(n)));
    return ["all", ...Array.from(set)] as string[];
  }, [graph.nodes]);

  const filteredNodes = useMemo(() => {
    let nodes = graph.nodes;
    if (categoryFilter !== "all") nodes = nodes.filter((n) => n.category === categoryFilter);
    if (typeFilter !== "all") nodes = nodes.filter((n) => normalizeNodeType(n) === typeFilter);
    if (filter.trim()) {
      const q = filter.toLowerCase();
      nodes = nodes.filter(
        (n) =>
          n.label.toLowerCase().includes(q) ||
          n.id.toLowerCase().includes(q) ||
          normalizeNodeType(n).toLowerCase().includes(q),
      );
    }
    return nodes;
  }, [graph.nodes, filter, categoryFilter, typeFilter]);

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
    requestAnimationFrame(() => {
      applyGraphFit(flowRef.current!, flowNodes, filteredNodes, filteredEdges);
    });
  }, [flowNodes, filteredNodes, filteredEdges]);

  const avgConf =
    filteredNodes.length && filteredNodes.some((n) => n.confidence != null)
      ? Math.round(
          filteredNodes.reduce((a, n) => a + (n.confidence ?? 0), 0) /
            filteredNodes.filter((n) => n.confidence != null).length,
        )
      : null;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 bg-vercel-bg/95 backdrop-blur-sm border border-vercel-border px-4 py-3">
        <div className="flex flex-wrap gap-2 items-center justify-center">
          <input
            type="search"
            placeholder="Search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-vercel-panel border border-vercel-border px-3 py-2 text-body font-semibold w-44 focus:border-vercel-info/50 outline-none"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-vercel-panel border border-vercel-border px-3 py-2 text-metadata font-semibold uppercase"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "Filter" : c}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-vercel-panel border border-vercel-border px-3 py-2 text-metadata font-semibold uppercase"
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t === "all" ? "Type" : t}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-6 mt-3 text-metadata font-semibold text-vercel-muted uppercase tracking-wide justify-center">
          <span>{filteredNodes.length} nodes</span>
          <span>{flowEdges.length} edges</span>
          {avgConf != null && <span className="text-vercel-success">conf {avgConf}%</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4 min-w-0">
        <div
          ref={containerRef}
          className="relative h-[calc(100vh-11rem)] min-h-[560px] border border-vercel-border overflow-hidden min-w-0"
        >
          <GraphCanvasBackground />

          {/* Column guides */}
          <div className="absolute inset-0 pointer-events-none z-0" aria-hidden>
            {COLUMN_LABELS.map((label, col) => (
              <div
                key={label}
                className="absolute top-3 text-[9px] font-bold uppercase tracking-[0.14em] text-vercel-muted/40 text-center"
                style={{
                  left: 80 + col * 300,
                  width: 220,
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
            minZoom={0.25}
            maxZoom={2}
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
            <GraphToolbar />
            <svg style={{ position: "absolute", width: 0, height: 0 }}>
              <defs>
                <marker
                  id="vayne-arrow"
                  markerWidth="12"
                  markerHeight="12"
                  refX="10"
                  refY="6"
                  orient="auto"
                >
                  <path d="M2,2 L10,6 L2,10 Z" fill="#52525b" />
                </marker>
              </defs>
            </svg>
          </ReactFlow>
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start min-w-0 shrink-0">
          <SidePanel title="Node Inspector">
            {selected ? (
              <div className="space-y-4 text-left min-w-0">
                <StatRow label="Label" value={selected.label.split("/").pop()} />
                <StatRow label="Type" value={normalizeNodeType(selected)} />
                {selected.confidence != null && <ConfidenceBar value={selected.confidence} />}
                {selected.risk != null && <StatRow label="Risk" value={selected.risk} />}
                {selected.evidence?.length ? (
                  <div className="min-w-0">
                    <p className="vx-card-title mb-2">Evidence</p>
                    <ul className="text-metadata space-y-1 text-white font-mono break-all">
                      {selected.evidence.slice(0, 5).map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-body font-semibold text-white text-center">
                Select a node to inspect evidence, confidence, and risk.
              </p>
            )}
          </SidePanel>
        </aside>
      </div>
    </div>
  );
}

export function GraphExplorer({ graph }: { graph: GraphData }) {
  return (
    <ReactFlowProvider>
      <GraphExplorerInner graph={graph} />
    </ReactFlowProvider>
  );
}
