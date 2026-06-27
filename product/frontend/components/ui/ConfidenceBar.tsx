"use client";

import { confidenceTone } from "@/lib/format";

export function ConfidenceBar({ value }: { value: number }) {
  const tone = confidenceTone(value);
  const color =
    tone === "success"
      ? "bg-vercel-success"
      : tone === "warning"
        ? "bg-vercel-warning"
        : "bg-vercel-danger";

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline">
        <span className="text-metadata text-vercel-muted uppercase tracking-wide">Confidence</span>
        <span className="text-body font-bold tabular-nums text-white">{value}%</span>
      </div>
      <div className="vx-confidence-bar">
        <div className={`vx-confidence-fill ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}
