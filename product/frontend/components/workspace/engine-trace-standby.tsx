"use client";

import { cn } from "@/lib/utils";

/**
 * Empty Engine Trace body — one centered sentence, matching Analyst empty state.
 */
export function EngineTraceStandby({
  running,
  className,
}: {
  running?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 items-center justify-center px-4 py-8 text-center",
        className,
      )}
    >
      <p className="max-w-[240px] text-[14px] leading-relaxed text-white/45">
        {running
          ? "Listening for the first stage — proof lines and formula evaluations will stream here as the engine runs."
          : "Ingest scanner evidence to stream live CLI proof, formula evaluations, and stage telemetry here."}
      </p>
    </div>
  );
}
