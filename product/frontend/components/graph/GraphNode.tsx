"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { formatGraphNodeLabel } from "@/lib/format";
import { glowForType, nodeSizeForType } from "@/lib/graph-node-styles";

function GraphNodeComponent({ data, selected }: NodeProps) {
  const type = String(data.type || "unknown");
  const label = String(data.label || data.id || "");
  const secondary = Boolean(data.secondary);
  const rejected = type.toLowerCase().includes("reject");
  const { primary, secondary: sublabel } = formatGraphNodeLabel(label);
  const glow = glowForType(type, secondary);
  const size = nodeSizeForType(type, secondary);
  const isPill = type === "endpoint" && !secondary;
  const [hovered, setHovered] = useState(false);
  const active = selected || hovered;
  const scale = active ? 1.04 : 1;

  const boxShadow = active
    ? `0 0 24px ${glow.color}88, 0 0 8px ${glow.color}44, inset 0 0 12px ${glow.color}22`
    : `0 0 12px ${glow.color}44, inset 0 0 6px ${glow.color}11`;

  return (
    <div
      className="graph-node-inner font-mono relative transition-transform duration-200"
      data-wave={data.animationWave ?? 0}
      data-index={data.animationIndex ?? 0}
      style={{
        width: size.width,
        opacity: secondary ? 0.65 : 1,
        transform: `scale(${scale})`,
        transformOrigin: "center center",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 6,
          height: 6,
          background: glow.color,
          border: "none",
          boxShadow: `0 0 6px ${glow.color}`,
        }}
      />
      <div
        style={{
          width: size.width,
          minHeight: size.height,
          background: "#050505",
          border: `1px solid ${glow.color}${secondary ? "66" : active ? "cc" : "99"}`,
          borderRadius: isPill || secondary ? 999 : 4,
          padding: secondary ? "8px 12px" : "10px 14px",
          boxShadow,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          className="uppercase tracking-wider text-center"
          style={{
            fontSize: secondary ? 9 : 10,
            color: glow.color,
            fontWeight: 700,
            letterSpacing: "0.14em",
            marginBottom: 4,
          }}
        >
          {secondary ? "evidence" : rejected ? "rejected" : type}
        </div>
        <div
          className="text-white font-bold text-center leading-tight"
          style={{ fontSize: secondary ? 11 : 13 }}
        >
          {primary}
        </div>
        {sublabel && !isPill && !secondary ? (
          <div
            className="mt-1 truncate text-center text-white/45"
            style={{ fontSize: 10 }}
          >
            {sublabel}
          </div>
        ) : null}
        {data.confidence != null && !secondary ? (
          <div
            className="mt-1.5 text-center font-bold tabular-nums"
            style={{ fontSize: 9, color: `${glow.color}cc` }}
          >
            {Math.round(Number(data.confidence))}% CONF
          </div>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 6,
          height: 6,
          background: glow.color,
          border: "none",
          boxShadow: `0 0 6px ${glow.color}`,
        }}
      />
    </div>
  );
}

export const GraphNode = memo(GraphNodeComponent);
