"use client";

import { AnimatedCounter } from "./AnimatedCounter";

export interface RichMetric {
  label: string;
  value: number | string;
  subtitle?: string;
  meta?: Array<{ k: string; v: string }>;
  animate?: boolean;
  primary?: boolean;
}

export function RichMetricGrid({ items, tier = "primary" }: { items: RichMetric[]; tier?: "primary" | "secondary" }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-vercel-border border border-vercel-border">
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-vercel-panel p-5 min-h-[128px] flex flex-col gap-2 vx-panel-hover vx-stagger-metric"
        >
          <span className="vx-card-title">{item.label}</span>
          <span className={tier === "primary" ? "vx-metric-primary" : "text-section font-bold text-white tabular-nums"}>
            {typeof item.value === "number" && item.animate !== false ? (
              <AnimatedCounter value={item.value} />
            ) : (
              item.value
            )}
          </span>
          {item.subtitle && (
            <span className="text-metadata text-vercel-muted normal-case">{item.subtitle}</span>
          )}
          {item.meta?.map(({ k, v }) => (
            <div key={k} className="flex justify-between text-metadata mt-auto pt-3 border-t border-vercel-border normal-case">
              <span className="text-vercel-muted uppercase tracking-wide">{k}</span>
              <span className="text-white font-semibold tabular-nums">{v}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
