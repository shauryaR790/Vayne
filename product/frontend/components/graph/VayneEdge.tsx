"use client";

import { memo, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { cn } from "@/lib/utils";

function VayneEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const active = hovered || selected;
  const label = String(data?.displayLabel || data?.relationship || "").replace(/_/g, " ");
  const rejected =
    String(data?.category ?? "").toLowerCase().includes("reject") ||
    String(data?.relationship ?? "").toLowerCase().includes("reject");
  const validated = !rejected && (Number(data?.confidence) > 0 || data?.validated);
  const playbackHidden = Boolean(data?.playbackHidden);
  const playbackActive = Boolean(data?.playbackActive);

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const stroke = playbackActive ? "#fafafa" : active ? "#fafafa" : validated ? "#a1a1aa" : "#52525b";
  const strokeWidth = playbackActive ? 3.5 : active ? 3 : validated ? 2.5 : 1.5;
  const opacity = playbackHidden ? 0 : data?.dimmed ? 0.15 : playbackActive ? 1 : active ? 1 : validated ? 0.75 : 0.35;

  return (
    <>
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke,
          strokeWidth,
          opacity,
          strokeDasharray: rejected ? "6 5" : undefined,
          transition: "opacity 200ms, stroke-width 200ms, stroke 200ms",
        }}
        className={cn(
          validated || active || playbackActive ? "vx-edge-flow" : undefined,
          playbackActive && "vx-edge-playback",
        )}
        markerEnd={`url(#vayne-arrow-${rejected ? "reject" : validated ? "valid" : "default"})`}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
              opacity: active ? 1 : 0.55,
            }}
            className="border border-white/25 bg-black px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/70"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const VayneEdge = memo(VayneEdgeComponent);
