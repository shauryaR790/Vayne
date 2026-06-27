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

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: active ? "#a1a1aa" : "#52525b",
          strokeWidth: active ? 3 : 2,
          opacity: active ? 1 : 0.35,
          transition: "opacity 150ms, stroke-width 150ms",
        }}
        markerEnd="url(#vayne-arrow)"
      />
      {active && label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
            }}
            className="px-2 py-0.5 bg-[#0a0a0a] border border-vercel-border text-[9px] font-bold uppercase tracking-wide text-vercel-muted"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const VayneEdge = memo(VayneEdgeComponent);
