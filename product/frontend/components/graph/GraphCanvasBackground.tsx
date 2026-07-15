"use client";

import { useEffect, useRef } from "react";

/** Tactical operations-room grid with subtle parallax drift. */
export function GraphCanvasBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    let ox = 0;
    let oy = 0;
    const tick = () => {
      ox = (ox + 0.04) % 60;
      oy = (oy + 0.025) % 60;
      el.style.backgroundPosition = `${ox}px ${oy}px, ${ox * 0.3}px ${oy * 0.3}px, 0 0`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0"
      aria-hidden
      style={{
        backgroundColor: "var(--vx-app)",
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px),
          linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)
        `,
        backgroundSize: "60px 60px, 60px 60px, 300px 300px, 300px 300px",
      }}
    />
  );
}
