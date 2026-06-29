"use client";

import { HoverCard, hoverCardClasses } from "@/components/shared/hover-card";
import { cn } from "@/lib/utils";

export interface ReasoningCheck {
  label: string;
  ok: boolean;
  variant?: "success" | "failure";
}

export function GraphEmptyState({ checks }: { checks: ReasoningCheck[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div className={cn(hoverCardClasses, "pointer-events-auto max-w-md px-6 py-8 text-center")}>
        <p className="text-[13px] font-black uppercase tracking-wider text-white">
          No Verified Attack Path Found
        </p>
        <p className="mt-2 text-[11px] text-white/50">
          VAYNE mapped the attack surface but could not construct a validated exploit chain.
        </p>
        <ul className="mt-6 space-y-2 text-left">
          {checks.map((c) => {
            const failure = c.variant === "failure";
            return (
              <li
                key={c.label}
                className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide"
              >
                <span
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center text-[10px] font-black",
                    c.ok ? "text-white" : failure ? "text-orange-400" : "text-white/25",
                  )}
                >
                  {failure ? "✗" : c.ok ? "✓" : "✗"}
                </span>
                <span
                  className={cn(
                    failure
                      ? "text-orange-400/90"
                      : c.ok
                        ? "text-white/80"
                        : "text-white/35 line-through",
                  )}
                >
                  {c.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
