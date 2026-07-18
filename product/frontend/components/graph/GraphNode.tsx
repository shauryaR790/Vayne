"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import { formatGraphNodeLabel } from "@/lib/format";
import { nodeSizeForType } from "@/lib/graph-node-styles";
import { normalizeGraphType, severityBorderColor } from "@/components/graph/graphUtils";
import { cn } from "@/lib/utils";

function GraphNodeComponent({ data, selected }: NodeProps) {
  const type = normalizeGraphType({
    id: String(data.id ?? ""),
    label: String(data.label ?? ""),
    type: String(data.type ?? "unknown"),
  });
  const label = String(data.label || data.id || "");
  const secondary = Boolean(data.secondary);
  const dimmed = Boolean(data.dimmed);
  const highlighted = Boolean(data.highlighted);
  const onChain = Boolean(data.onChain);
  const { primary, secondary: sublabel } = formatGraphNodeLabel(label);
  const size = nodeSizeForType(type, secondary);
  const isPill = type === "endpoint" && !secondary;
  const [hovered, setHovered] = useState(false);
  const active = selected || hovered || highlighted;

  const borderColor = severityBorderColor({
    id: String(data.id ?? ""),
    label,
    type,
    risk: Number(data.risk ?? 0),
    criticality: data.criticality as string | undefined,
  });

  return (
    <div
      className={cn(
        "graph-node-inner relative font-mono transition-opacity duration-200",
        active && "z-10",
      )}
      data-node-id={String(data.id ?? "")}
      style={{
        width: size.width,
        opacity: dimmed ? 0.2 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1.5 !w-1.5 !border-none"
        style={{ background: borderColor }}
      />
      <div
        style={{
          width: size.width,
          minHeight: size.height,
          background: "#09090b",
          border: `${active || onChain ? 2 : 1}px solid ${borderColor}`,
          borderRadius: isPill || secondary ? 999 : 8,
          padding: secondary ? "8px 12px" : "10px 14px",
          boxShadow: active ? `0 0 0 1px ${borderColor}33` : undefined,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div className="text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-white/40">
          {secondary ? "evidence" : type}
        </div>
        <div className="text-center text-[12px] font-semibold leading-tight text-white/90">{primary}</div>
        {sublabel && !isPill && !secondary ? (
          <div className="mt-1 truncate text-center text-[10px] text-white/35">{sublabel}</div>
        ) : null}
        {data.confidence != null && !secondary ? (
          <div className="mt-1 text-center text-[9px] tabular-nums text-white/35">
            {Math.round(Number(data.confidence))}%
          </div>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-1.5 !w-1.5 !border-none"
        style={{ background: borderColor }}
      />
    </div>
  );
}

export const GraphNode = memo(GraphNodeComponent);
