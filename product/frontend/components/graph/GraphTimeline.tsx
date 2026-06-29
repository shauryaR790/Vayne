"use client";

import { TIMELINE_STEPS } from "@/lib/graph-node-styles";
import { cn } from "@/lib/utils";

export function GraphTimeline({ activeType }: { activeType?: string | null }) {
  const normalized = (activeType ?? "").toLowerCase();

  return (
    <div className="flex flex-wrap items-center gap-1 border border-white/20 bg-black px-4 py-2.5">
      {TIMELINE_STEPS.map((step, i) => {
        const active = step.types.some((t) => normalized.includes(t));
        return (
          <span key={step.id} className="flex items-center gap-1">
            <span
              className={cn(
                "border px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition-colors",
                active
                  ? "border-white bg-white text-black"
                  : "border-white/30 text-white/50",
              )}
            >
              {step.label}
            </span>
            {i < TIMELINE_STEPS.length - 1 && (
              <span className="text-white/25">→</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
