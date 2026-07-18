"use client";

import { memo, useState } from "react";
import { Handle, NodeToolbar, Position, type NodeProps } from "@xyflow/react";

import { formatGraphNodeLabel } from "@/lib/format";
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH } from "@/lib/graph-node-styles";
import { graphNodeIcon, nodeBorderColor } from "@/components/graph/graphNodePresentation";
import { normalizeGraphType } from "@/components/graph/graphUtils";
import { cn } from "@/lib/utils";

function GraphNodeComponent({ data, selected }: NodeProps) {
  const node = {
    id: String(data.id ?? ""),
    label: String(data.label ?? ""),
    type: String(data.type ?? "unknown"),
    risk: Number(data.risk ?? 0),
    criticality: data.criticality as string | undefined,
    confidence: data.confidence as number | undefined,
    evidence: data.evidence as string[] | undefined,
  };
  const type = normalizeGraphType(node);
  const label = node.label || node.id;
  const dimmed = Boolean(data.dimmed);
  const highlighted = Boolean(data.highlighted);
  const onChain = Boolean(data.onChain);
  const { primary, secondary: subtitle } = formatGraphNodeLabel(label);
  const Icon = graphNodeIcon(type);
  const border = nodeBorderColor(node);
  const [hovered, setHovered] = useState(false);
  const active = selected || highlighted || onChain;

  const meta =
    node.confidence != null
      ? `${Math.round(node.confidence)}% confidence`
      : type.replace(/_/g, " ");

  return (
    <>
      <NodeToolbar
        isVisible={hovered && !dimmed}
        position={Position.Top}
        className="!rounded-md !border !border-white/10 !bg-[#09090b] !px-2.5 !py-1.5 !text-[11px] !text-white/80 !shadow-none"
      >
        <div className="font-medium text-white">{primary}</div>
        {subtitle ? <div className="text-white/45">{subtitle}</div> : null}
      </NodeToolbar>

      <div
        className={cn("relative transition-opacity duration-200", active && "z-10")}
        style={{ width: GRAPH_NODE_WIDTH, opacity: dimmed ? 0.18 : 1 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2 !w-2 !border-2 !border-[#09090b]"
          style={{ background: border }}
        />
        <div
          className={cn(
            "flex h-full flex-col rounded-xl border bg-[#09090b] px-3.5 py-3 transition-[border-color,box-shadow]",
            active && "shadow-[0_0_0_1px_rgba(255,255,255,0.06)]",
          )}
          style={{
            width: GRAPH_NODE_WIDTH,
            minHeight: GRAPH_NODE_HEIGHT,
            borderColor: active ? border : `${border}99`,
            borderWidth: active ? 2 : 1,
          }}
        >
          <div className="flex items-start gap-2.5">
            <div
              className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.03]"
              style={{ color: border }}
            >
              <Icon className="size-4" strokeWidth={1.6} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold leading-tight text-white/95">{primary}</div>
              {subtitle ? (
                <div className="mt-0.5 truncate text-[11px] text-white/45">{subtitle}</div>
              ) : (
                <div className="mt-0.5 truncate text-[11px] capitalize text-white/35">{type}</div>
              )}
              <div className="mt-2 truncate text-[10px] uppercase tracking-wide text-white/30">{meta}</div>
            </div>
          </div>
        </div>
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2 !w-2 !border-2 !border-[#09090b]"
          style={{ background: border }}
        />
      </div>
    </>
  );
}

export const GraphNode = memo(GraphNodeComponent);
