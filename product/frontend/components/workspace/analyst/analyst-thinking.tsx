"use client";

import { cn } from "@/lib/utils";

export function AnalystThinking({
  step,
  className,
}: {
  step: string | null;
  className?: string;
}) {
  if (!step) return null;

  return (
    <div className={cn("rounded-md border border-vx-border bg-vx-panel px-3 py-3", className)}>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-vx-muted">
        VANE Analyst
      </p>
      <p className="font-mono text-[13px] text-vx-secondary">
        <span className="text-vx-muted">{">"}</span> {step}
        <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-vx-secondary align-middle" />
      </p>
    </div>
  );
}
