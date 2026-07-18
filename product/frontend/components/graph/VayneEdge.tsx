"use client";

import { memo, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
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
  const label = String(data?.displayLabel || data?.relationship || "").replace(/_/g, " ");
  const rejected =
    String(data?.category ?? "").toLowerCase().includes("reject") ||
    String(data?.relationship ?? "").toLowerCase().includes("reject");
  const dimmed = Boolean(data?.dimmed);
  const highlightRole = data?.highlightRole as "incoming" | "outgoing" | "chain" | undefined;

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  const stroke = rejected
    ? "#f97316"
    : highlightRole === "incoming"
      ? "#38bdf8"
      : highlightRole === "outgoing"
        ? "#a78bfa"
        : highlightRole === "chain"
          ? "#fafafa"
          : active
            ? "#e4e4e7"
            : "#71717a";
  const strokeWidth = active || highlightRole ? 2.5 : 1.5;
  const opacity = dimmed ? 0.12 : active || highlightRole ? 1 : rejected ? 0.45 : 0.65;

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
          stroke,
          strokeWidth,
          opacity,
          strokeDasharray: rejected ? "6 5" : undefined,
          transition: "opacity 180ms, stroke-width 180ms, stroke 180ms",
        }}
        className={active ? "vx-edge-flow" : undefined}
        markerEnd={`url(#vayne-arrow-${rejected ? "reject" : active || highlightRole ? "valid" : "default"})`}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "none",
              opacity: dimmed ? 0.15 : active ? 1 : 0.75,
            }}
            className="rounded border border-white/10 bg-[#09090b]/95 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/70"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const VayneEdge = memo(VayneEdgeComponent);
