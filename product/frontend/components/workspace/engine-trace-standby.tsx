"use client";

import { AnalystDockFootprint } from "@/components/workspace/analyst/analyst-dock-footprint";
import { cn } from "@/lib/utils";

/**
 * Empty Engine Trace — mirrors Analyst empty layout so the sentence shares
 * the same vertical center (content flex-1 + identical dock footprint).
 */
export function EngineTraceStandby({
  running,
  className,
}: {
  running?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-hidden px-4 py-5">
        <div className="flex h-full min-h-[200px] items-center justify-center px-2 text-center">
          <p className="max-w-[240px] font-sans text-[14px] leading-relaxed text-vx-muted">
            {running
              ? "Listening for the first stage — proof lines and formula evaluations will stream here as the engine runs."
              : "Ingest scanner evidence to stream live CLI proof, formula evaluations, and stage telemetry here."}
          </p>
        </div>
      </div>
      <AnalystDockFootprint />
    </div>
  );
}
