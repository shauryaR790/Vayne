"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";

import { severityBorderColor } from "@/components/graph/graphUtils";
import { cn } from "@/lib/utils";

function GraphGroupNodeComponent({ data, selected }: NodeProps) {
  const label = String(data.label || "Service group");
  const expanded = Boolean(data.expanded);
  const count = Number(data.memberCount ?? 0);
  const dimmed = Boolean(data.dimmed);
  const border = severityBorderColor({
    id: String(data.id ?? ""),
    label,
    type: "group",
    risk: Number(data.risk ?? 0),
  });

  return (
    <div
      className={cn(
        "relative font-mono transition-opacity duration-200",
        selected && "z-10",
      )}
      style={{
        width: 190,
        opacity: dimmed ? 0.2 : 1,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1.5 !w-1.5 !border-none !bg-zinc-500"
      />
      <button
        type="button"
        className="flex w-full flex-col gap-2 rounded-lg border bg-[#09090b] px-3 py-3 text-left transition-colors hover:bg-[#111113]"
        style={{ borderColor: selected ? border : `${border}99` }}
        onClick={(e) => {
          e.stopPropagation();
          const toggle = data.onToggle as (() => void) | undefined;
          toggle?.();
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45">
            <Layers className="size-3" strokeWidth={1.5} />
            Group
          </div>
          {expanded ? (
            <ChevronDown className="size-3.5 text-white/50" />
          ) : (
            <ChevronRight className="size-3.5 text-white/50" />
          )}
        </div>
        <div className="text-[12px] font-semibold leading-tight text-white/90">{label}</div>
        <div className="text-[10px] text-white/40">
          {expanded ? "Expanded" : `${count || "Multiple"} services · click to expand`}
        </div>
      </button>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-1.5 !w-1.5 !border-none !bg-zinc-500"
      />
    </div>
  );
}

export const GraphGroupNode = memo(GraphGroupNodeComponent);
