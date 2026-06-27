"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { nodeTypeColor, formatGraphNodeLabel } from "@/lib/format";

function GraphNodeComponent({ data, selected }: NodeProps) {
  const type = String(data.type || "unknown");
  const label = String(data.label || data.id || "");
  const secondary = Boolean(data.secondary);
  const { primary, secondary: sublabel } = formatGraphNodeLabel(label);
  const accent = nodeTypeColor(type);
  const isPill = type === "endpoint" && !secondary;
  const maxW = secondary ? 150 : isPill ? 160 : 220;
  const opacity = secondary ? 0.55 : 1;

  return (
    <div
      className="graph-node-inner font-mono relative"
      data-wave={data.animationWave ?? 0}
      data-index={data.animationIndex ?? 0}
      style={{ maxWidth: maxW, opacity }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 5, height: 5, background: accent, border: "none", opacity: 0.4 }}
      />
      <div style={{ maxWidth: maxW }}>
        <div
          style={{
            background: "#0a0a0a",
            border: `1px solid ${accent}${secondary ? "66" : ""}`,
            borderRadius: isPill || secondary ? 999 : 6,
            padding: secondary ? "3px 8px" : isPill ? "4px 10px" : "6px 10px",
            boxShadow: selected ? `0 0 0 1px ${accent}88` : undefined,
            transform: secondary ? "scale(0.92)" : undefined,
            transformOrigin: "center left",
          }}
        >
          <div
            className="uppercase tracking-wider mb-0.5 text-center"
            style={{
              fontSize: secondary ? 8 : 9,
              color: accent,
              fontWeight: 700,
              letterSpacing: "0.1em",
            }}
          >
            {secondary ? "evidence" : type}
          </div>
          <div
            className="text-white font-semibold text-center"
            style={{ fontSize: secondary ? 10 : 11, lineHeight: 1.3 }}
          >
            {primary}
          </div>
          {sublabel && !isPill && !secondary ? (
            <div className="text-vercel-muted mt-0.5 truncate text-center" style={{ fontSize: 10 }}>
              {sublabel}
            </div>
          ) : null}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 5, height: 5, background: accent, border: "none", opacity: 0.4 }}
      />
    </div>
  );
}

export const GraphNode = memo(GraphNodeComponent);
