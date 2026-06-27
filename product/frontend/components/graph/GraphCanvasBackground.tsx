"use client";

import { useEffect, useRef } from "react";

export function GraphCanvasBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    let ox = 0;
    let oy = 0;
    const tick = () => {
      ox = (ox + 0.08) % 48;
      oy = (oy + 0.05) % 48;
      el.style.backgroundPosition = `${ox}px ${oy}px, 0 0, 0 0`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <div ref={ref} className="absolute inset-0 vx-graph-bg pointer-events-none" aria-hidden />;
}
