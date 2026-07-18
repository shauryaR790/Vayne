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
  const active = hovered || selected || data?.highlighted;
  const label = String(data?.displayLabel || data?.relationship || "").toUpperCase();
  const dimmed = Boolean(data?.dimmed);
  const onPath = Boolean(data?.highlightRole);

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const stroke = onPath || active ? "#f4f4f5" : "#52525b";
  const strokeWidth = onPath || active ? 2.5 : 1.75;
  const opacity = dimmed ? 0.16 : onPath || active ? 0.95 : 0.42;

  return (
    <>
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
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
          transition: "opacity 200ms, stroke 200ms, stroke-width 200ms",
        }}
        markerEnd={`url(#vayne-arrow-${onPath || active ? "valid" : "default"})`}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "none",
              opacity: dimmed ? 0.14 : onPath || active ? 1 : 0.72,
            }}
            className="rounded-full border border-white/12 bg-[#09090b]/95 px-2 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-white/75"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const VayneEdge = memo(VayneEdgeComponent);
