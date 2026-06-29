"use client";

import { MarqueeStrip } from "@/components/shared/marquee-strip";

export function TechnicalZoneGate() {
  return (
    <div
      id="technical-zone-gate"
      className="vx-canvas-section scroll-mt-8"
      role="separator"
      aria-label="Technical workspace begins below"
    >
      <MarqueeStrip label="TECHNICAL WORKSPACE" fullBleed className="my-14" />
    </div>
  );
}
