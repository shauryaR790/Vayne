"use client";

import { memo, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

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

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const stroke = active ? "#e4e4e7" : validated ? "#71717a" : rejected ? "#f97316" : "#52525b";
  const strokeWidth = active ? 3.5 : validated ? 2.5 : 2;
  const opacity = active ? 1 : validated ? 0.65 : rejected ? 0.45 : 0.4;

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
          strokeDasharray: rejected ? "8 6" : undefined,
          transition: "opacity 200ms, stroke-width 200ms, stroke 200ms",
        }}
        className={validated || active ? "vx-edge-flow" : undefined}
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
