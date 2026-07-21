"use client";

import { ChevronRight } from "lucide-react";

import type { GraphBreadcrumb } from "./useProgressiveGraph";
import { cn } from "@/lib/utils";

export function GraphLevelNav({
  stack,
  onNavigate,
  hiddenCount,
  visibleCount,
  loading,
}: {
  stack: GraphBreadcrumb[];
  onNavigate: (index: number) => void;
  hiddenCount?: number;
  visibleCount?: number;
  loading?: boolean;
}) {
  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/75 px-3 py-2 backdrop-blur-sm">
      <nav className="flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-white/70">
        {stack.map((crumb, index) => (
          <span key={crumb.id} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight className="size-3 text-white/30" /> : null}
            <button
              type="button"
              onClick={() => onNavigate(index)}
              className={cn(
                "truncate rounded px-1.5 py-0.5 transition-colors hover:bg-white/10 hover:text-white",
                index === stack.length - 1 && "font-medium text-white",
              )}
            >
              {crumb.label}
            </button>
          </span>
        ))}
        {loading ? <span className="ml-2 text-white/40">Loading…</span> : null}
      </nav>
      <div className="shrink-0 text-[10px] uppercase tracking-wide text-white/40">
        {visibleCount ?? 0} visible
        {hiddenCount != null && hiddenCount > 0 ? ` · ${hiddenCount.toLocaleString()} hidden` : ""}
      </div>
    </div>
  );
}
