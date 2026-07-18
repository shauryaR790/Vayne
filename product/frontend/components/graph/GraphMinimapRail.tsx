"use client";

import { MiniMap, Panel } from "@xyflow/react";

/** Fixed right rail — not a floating overlay on the graph canvas. */
export function GraphMinimapRail() {
  return (
    <Panel
      position="top-right"
      className="!top-0 !right-0 !m-0 flex h-full w-[148px] flex-col border-l border-white/10 bg-[#050505]"
    >
      <div className="border-b border-white/[0.06] px-2 py-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">
        Overview
      </div>
      <div className="relative min-h-0 flex-1 p-2">
        <MiniMap
          className="!static !m-0 !h-full !w-full !rounded-md !border !border-white/10 !bg-[#09090b]"
          nodeColor={(node) => {
            const risk = Number(node.data?.risk ?? 0);
            if (risk >= 8) return "#ef4444";
            if (risk >= 6) return "#f97316";
            if (risk >= 4) return "#eab308";
            return "#52525b";
          }}
          maskColor="rgba(5,5,5,0.72)"
          pannable
          zoomable
        />
      </div>
    </Panel>
  );
}
