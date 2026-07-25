"use client";

import { cn } from "@/lib/utils";

/** Matches Ask VAYNE empty copy so both side panels share type + vertical center. */
const EMPTY_COPY =
  "font-sans text-[14px] leading-relaxed text-vx-muted";

/**
 * Empty Engine Trace body — same type + vertical center as Analyst empty state.
 * Bottom spacer mirrors the analyst composer block so the sentences line up.
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
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-5 text-center">
        <p className={cn("max-w-[240px]", EMPTY_COPY)}>
          {running
            ? "Listening for the first stage — proof lines and formula evaluations will stream here as the engine runs."
            : "Ingest scanner evidence to stream live CLI proof, formula evaluations, and stage telemetry here."}
        </p>
      </div>

      {/* Footprint of analyst quota + composer so empty copy sits at the same height */}
      <div className="shrink-0 space-y-2 p-3" aria-hidden>
        <div className="h-[11px]" />
        <div className="h-[76px]" />
      </div>
    </div>
  );
}

export const ENGINE_TRACE_EMPTY_COPY_CLASS = EMPTY_COPY;
