"use client";

import { useCallback, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { FIT_PADDING, FIT_DURATION, FIT_MAX_ZOOM, FIT_MIN_ZOOM } from "./graphFit";

const BTN =
  "border border-white bg-black px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-white/60 transition-colors hover:bg-white hover:text-black disabled:opacity-40";

export function GraphToolbar({
  className,
  containerRef,
}: {
  className?: string;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const { fitView, setViewport, zoomIn, zoomOut, getNodes } = useReactFlow();
  const exporting = useRef(false);

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
    requestAnimationFrame(() => fit());
  }, [setViewport, fit]);

  const center = useCallback(() => {
    fitView({
      nodes: getNodes().filter((n) => !n.hidden),
      padding: FIT_PADDING,
      duration: FIT_DURATION,
      maxZoom: FIT_MAX_ZOOM,
      minZoom: FIT_MIN_ZOOM,
    });
  }, [fitView, getNodes]);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef?.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen();
    }
  }, [containerRef]);

  const captureImage = useCallback(
    async (filename: string) => {
      if (exporting.current || !containerRef?.current) return;
      exporting.current = true;
      try {
        const { toPng } = await import("html-to-image");
        const dataUrl = await toPng(containerRef.current, {
          backgroundColor: "#000000",
          pixelRatio: 2,
        });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = filename;
        a.click();
      } catch {
        /* export unavailable */
      } finally {
        exporting.current = false;
      }
    },
    [containerRef],
  );

  const exportSvg = useCallback(() => {
    const root = containerRef?.current;
    if (!root) return;
    const edgeSvg = root.querySelector(".react-flow__edges") as SVGSVGElement | null;
    if (!edgeSvg) return;
    const clone = edgeSvg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "vayne-attack-graph.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [containerRef]);

  return (
    <div className={`grid grid-cols-2 gap-1.5 ${className ?? ""}`}>
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
      <button type="button" className={BTN} onClick={toggleFullscreen}>
        Fullscreen
      </button>
      <button
        type="button"
        className={BTN}
        onClick={() => captureImage("vayne-attack-graph.png")}
      >
        Export PNG
      </button>
      <button type="button" className={BTN} onClick={exportSvg}>
        Export SVG
      </button>
      <button
        type="button"
        className={`${BTN} col-span-2`}
        onClick={() => captureImage("vayne-graph-screenshot.png")}
      >
        Screenshot
      </button>
    </div>
  );
}
