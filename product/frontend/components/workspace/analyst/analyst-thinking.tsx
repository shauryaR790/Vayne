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
    <p className={cn("font-mono text-[13px] text-vx-muted", className)}>
      <span>{">"}</span> {step}
      <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-vx-secondary align-middle" />
    </p>
  );
}
