"use client";

import { motion } from "motion/react";

import { cn } from "@/lib/utils";

export function RiskMeter({
  value,
  max = 10,
  label,
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  className?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/50">
          {label}
        </span>
      )}
      <div className="flex items-center gap-3">
        <div className="h-2 min-w-0 max-w-[58%] flex-1 overflow-hidden border border-white/15 bg-surface-raised">
          <motion.div
            className="h-full bg-white"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        <span className="shrink-0 text-lg font-black leading-none">{value.toFixed(1)}</span>
      </div>
    </div>
  );
}

export function ProgressBar({
  value,
  label,
  display,
  className,
}: {
  value: number;
  label: string;
  display?: string;
  className?: string;
}) {
  const displayValue = (display ?? `${value}%`).toUpperCase();

  return (
    <div className={cn("space-y-2", className)}>
      <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/50">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <div className="h-2 min-w-0 max-w-[58%] flex-1 overflow-hidden border border-white/15 bg-surface-raised">
          <motion.div
            className="h-full bg-white"
            initial={{ width: 0 }}
            animate={{ width: `${value}%` }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        </div>
        <span className="shrink-0 text-lg font-black uppercase leading-none">
          {displayValue}
        </span>
      </div>
    </div>
  );
}
