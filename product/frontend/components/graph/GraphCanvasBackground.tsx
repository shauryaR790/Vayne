"use client";

/** Minimal canvas — no animation, subtle grid only. */
export function GraphCanvasBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden
      style={{
        backgroundColor: "var(--vx-app, #050505)",
        backgroundImage: `
          radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)
        `,
        backgroundSize: "24px 24px",
      }}
    />
  );
}
