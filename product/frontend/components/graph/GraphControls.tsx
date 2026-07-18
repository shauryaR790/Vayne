"use client";

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";

import { FIT_DURATION, FIT_MAX_ZOOM, FIT_MIN_ZOOM, FIT_PADDING } from "./graphFit";

const BTN =
  "flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/70 text-white/60 backdrop-blur-sm transition-colors hover:border-white/25 hover:bg-black hover:text-white";

export function GraphControls() {
  const { fitView, setViewport, zoomIn, zoomOut, getNodes } = useReactFlow();

  const fit = useCallback(() => {
    const nodes = getNodes().filter((n) => !n.hidden);
    if (!nodes.length) return;
    fitView({
      nodes,
      padding: FIT_PADDING,
      duration: FIT_DURATION,
      maxZoom: FIT_MAX_ZOOM,
      minZoom: FIT_MIN_ZOOM,
    });
  }, [fitView, getNodes]);

  const reset = useCallback(() => {
    setViewport({ x: 0, y: 0, zoom: 1 }, { duration: FIT_DURATION });
    window.requestAnimationFrame(() => fit());
  }, [setViewport, fit]);

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-20 flex gap-1.5">
      <button type="button" className={BTN} aria-label="Zoom in" onClick={() => zoomIn({ duration: 200 })}>
        <Plus className="size-3.5" strokeWidth={1.75} />
      </button>
      <button type="button" className={BTN} aria-label="Zoom out" onClick={() => zoomOut({ duration: 200 })}>
        <Minus className="size-3.5" strokeWidth={1.75} />
      </button>
      <button type="button" className={BTN} aria-label="Fit graph" onClick={fit}>
        <Maximize2 className="size-3.5" strokeWidth={1.75} />
      </button>
      <button type="button" className={BTN} aria-label="Reset view" onClick={reset}>
        <RotateCcw className="size-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}
