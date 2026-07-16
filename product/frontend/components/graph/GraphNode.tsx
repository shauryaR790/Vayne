"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { formatGraphNodeLabel } from "@/lib/format";
import { glowForType, nodeSizeForType } from "@/lib/graph-node-styles";
import { cn } from "@/lib/utils";

function GraphNodeComponent({ data, selected }: NodeProps) {
  const type = String(data.type || "unknown");
  const label = String(data.label || data.id || "");
  const secondary = Boolean(data.secondary);
  const rejected = type.toLowerCase().includes("reject");
  const dimmed = Boolean(data.dimmed);
  const { primary, secondary: sublabel } = formatGraphNodeLabel(label);
  const glow = glowForType(type, secondary);
  const size = nodeSizeForType(type, secondary);
  const isPill = type === "endpoint" && !secondary;
  const [hovered, setHovered] = useState(false);
  const active = selected || hovered;
  const playbackHidden = Boolean(data.playbackHidden);
  const playbackActive = Boolean(data.playbackActive);
  const scale = playbackActive ? 1.04 : active ? 1.03 : 1;

  const boxShadow = playbackActive
    ? `0 0 28px ${glow.color}88, inset 0 0 12px ${glow.color}22`
    : active
      ? `0 0 16px ${glow.color}55, inset 0 0 8px ${glow.color}15`
      : `0 0 8px ${glow.color}22`;

  return (
    <div
      className={cn(
        "graph-node-inner font-mono relative transition-transform duration-200",
        playbackActive && "graph-node-playback-active",
      )}
      data-wave={data.animationWave ?? 0}
      data-index={data.animationIndex ?? 0}
      data-node-id={String(data.id ?? "")}
      style={{
        width: size.width,
        opacity: playbackHidden ? 0 : dimmed ? 0.18 : secondary ? 0.55 : 1,
        transform: `scale(${scale})`,
        transformOrigin: "center center",
        pointerEvents: playbackHidden ? "none" : undefined,
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
