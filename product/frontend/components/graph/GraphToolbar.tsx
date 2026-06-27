"use client";

import { useReactFlow } from "@xyflow/react";
import { applyGraphFit, DEFAULT_FIT_PADDING } from "./graphFit";

const BTN =
  "px-3 py-1.5 text-metadata font-bold uppercase tracking-wide border border-vercel-border bg-vercel-panel text-vercel-muted hover:text-white hover:border-vercel-border-hover transition-colors duration-150";

export function GraphToolbar() {
  const { fitView, setViewport, zoomIn, zoomOut, getNodes } = useReactFlow();

  function fit() {
    fitView({
      nodes: getNodes().filter((n) => !n.data?.secondary),
      padding: DEFAULT_FIT_PADDING,
      duration: 300,
      maxZoom: 2,
    });
  }

  function reset() {
    setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 });
    requestAnimationFrame(() => fit());
  }

  function center() {
    fitView({
      nodes: getNodes().filter((n) => !n.data?.secondary),
      padding: DEFAULT_FIT_PADDING,
      duration: 300,
      maxZoom: 2,
    });
  }

  function focusSelected() {
    const selected = getNodes().find((n) => n.selected);
    if (!selected) {
      center();
      return;
    }
    fitView({ nodes: [selected], padding: 80, duration: 300, maxZoom: 1.4 });
  }

  return (
    <div className="absolute top-3 left-3 z-20 flex flex-wrap gap-1">
      <button type="button" className={BTN} onClick={fit}>
        Fit
      </button>
      <button type="button" className={BTN} onClick={reset}>
        Reset
      </button>
      <button type="button" className={BTN} onClick={() => zoomIn({ duration: 200 })}>
        Zoom+
      </button>
      <button type="button" className={BTN} onClick={() => zoomOut({ duration: 200 })}>
        Zoom−
      </button>
      <button type="button" className={BTN} onClick={center}>
        Center
      </button>
      <button type="button" className={BTN} onClick={focusSelected}>
        Focus
      </button>
    </div>
  );
}

export { applyGraphFit };
