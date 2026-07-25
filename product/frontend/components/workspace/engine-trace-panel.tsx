"use client";

import { EngineTraceHeader } from "@/components/workspace/analyst/analyst-panel-header";
import { EngineTraceLive } from "@/components/workspace/engine-trace-live";
import { EngineTraceStandby } from "@/components/workspace/engine-trace-standby";
import type { EngineTraceEvent } from "@/lib/engine-trace";
import { cn } from "@/lib/utils";

/** Standalone Engine Trace column for the swappable desktop dock. */
export function EngineTracePanel({
  events = [],
  running,
  className,
}: {
  events?: EngineTraceEvent[];
  running?: boolean;
  className?: string;
}) {
  const live = events.length > 0 || running;

  if (live) {
    return (
      <EngineTraceLive
        events={events}
        running={running}
        className={cn("h-full min-h-0 min-w-0 border-l-0", className)}
      />
    );
  }

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden bg-[#141414]",
        className,
      )}
    >
      <EngineTraceHeader />
      <EngineTraceStandby />
    </aside>
  );
}
