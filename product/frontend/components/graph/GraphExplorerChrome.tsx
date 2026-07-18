"use client";

import { Search } from "lucide-react";
import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";

import { FIT_DURATION, FIT_MAX_ZOOM, FIT_MIN_ZOOM, FIT_PADDING } from "./graphFit";

export type GraphFilterId = "critical" | "exploitable" | "internet" | "lateral";

const FILTERS: { id: GraphFilterId; label: string }[] = [
  { id: "critical", label: "Critical" },
  { id: "exploitable", label: "Exploitable" },
  { id: "internet", label: "Internet" },
  { id: "lateral", label: "Lateral" },
];

const BTN =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md border border-white/10 bg-[#09090b] px-2.5 text-[11px] font-medium text-white/55 transition-colors hover:border-white/20 hover:text-white/85 disabled:opacity-40";

const ICON_BTN =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#09090b] text-white/55 transition-colors hover:border-white/20 hover:text-white/85";

export function GraphExplorerChrome({
  query,
  onQueryChange,
  activeFilters,
  onToggleFilter,
  matchCount,
  totalCount,
  nodeCount,
  edgeCount,
  loading,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  activeFilters: Set<GraphFilterId>;
  onToggleFilter: (id: GraphFilterId) => void;
  matchCount: number;
  totalCount: number;
  nodeCount: number;
  edgeCount: number;
  loading?: boolean;
}) {
  const { fitView, setViewport, zoomIn, zoomOut, getNodes } = useReactFlow();

  const fit = useCallback(() => {
    const nodes = getNodes().filter((n) => !n.hidden);
    if (!nodes.length) return;
    fitView({
      nodes,
      padding: FIT_PADDING,
      duration: FIT_DURATION,
      maxZoom: FIT_MAX_ZOOM,
      minZoom: 0.15,
    });
  }, [fitView, getNodes]);

  const reset = useCallback(() => {
    setViewport({ x: 0, y: 0, zoom: 1 }, { duration: FIT_DURATION });
    window.requestAnimationFrame(() => fit());
  }, [setViewport, fit]);

  return (
    <div className="shrink-0 border-b border-white/10 bg-[#050505]">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <label className="relative min-w-[180px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/30"
            strokeWidth={1.5}
          />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search hosts, services, CVEs…"
            className="h-8 w-full rounded-md border border-white/10 bg-[#09090b] pl-8 pr-3 text-[12px] text-white/85 outline-none placeholder:text-white/30 focus:border-white/20"
          />
        </label>

        <div className="flex flex-wrap gap-1">
          {FILTERS.map((filter) => {
            const active = activeFilters.has(filter.id);
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => onToggleFilter(filter.id)}
                className={`rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-wide transition-colors ${
                  active
                    ? "border-white/25 bg-white/10 text-white"
                    : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/70"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button type="button" className={ICON_BTN} aria-label="Zoom in" onClick={() => zoomIn({ duration: 180 })}>
            <Plus className="size-3.5" strokeWidth={1.75} />
          </button>
          <button type="button" className={ICON_BTN} aria-label="Zoom out" onClick={() => zoomOut({ duration: 180 })}>
            <Minus className="size-3.5" strokeWidth={1.75} />
          </button>
          <button type="button" className={BTN} onClick={fit}>
            <Maximize2 className="size-3.5" strokeWidth={1.75} />
            Fit
          </button>
          <button type="button" className={ICON_BTN} aria-label="Reset view" onClick={reset}>
            <RotateCcw className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-1.5 text-[10px] uppercase tracking-wide text-white/30">
        <span>
          {nodeCount} nodes · {edgeCount} edges
          {loading ? " · laying out…" : null}
        </span>
        {query.trim() ? (
          <span>
            {matchCount}/{totalCount} matches
          </span>
        ) : (
          <span>Scroll to zoom · drag to pan · double-click node to focus</span>
        )}
      </div>
    </div>
  );
}
