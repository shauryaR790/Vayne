"use client";

import { TIMELINE_STEPS } from "@/lib/graph-node-styles";
import { cn } from "@/lib/utils";

export function GraphTimeline({
  activeType,
  compact = false,
}: {
  activeType?: string | null;
  compact?: boolean;
}) {
  const normalized = (activeType ?? "").toLowerCase();
  const activeIndex = TIMELINE_STEPS.findIndex((step) =>
    step.types.some((t) => normalized.includes(t)),
  );

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1",
        compact ? "px-4 py-2.5" : "border border-white/20 bg-black px-4 py-2.5",
      )}
    >
      {TIMELINE_STEPS.map((step, i) => {
        const active = step.types.some((t) => normalized.includes(t));
        const passed = activeIndex >= 0 && i < activeIndex;
        return (
          <span key={step.id} className="flex items-center gap-1">
            <span
              className={cn(
                "border px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition-all duration-300",
                active
                  ? "border-white bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.25)]"
                  : passed
                    ? "border-white/40 text-white/70"
                    : "border-white/20 text-white/35",
              )}
            >
              {step.label}
            </span>
            {i < TIMELINE_STEPS.length - 1 && (
              <span className={cn("text-[10px]", passed || active ? "text-white/45" : "text-white/20")}>
                →
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
