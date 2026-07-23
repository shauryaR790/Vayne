"use client";

import { cn } from "@/lib/utils";

export interface WorkstationTab {
  id: string;
  label: string;
}

export function WorkstationTabBar({
  tabs,
  active,
  onSelect,
  className,
}: {
  tabs: WorkstationTab[];
  active: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 shrink-0 border-b border-vx-border bg-vx-app",
        className,
      )}
    >
      <div
        className="flex gap-1 overflow-x-auto px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Investigation details"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(tab.id)}
              className={cn(
                "inline-flex shrink-0 items-center rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors",
                selected
                  ? "border-white/20 bg-vx-panel text-white"
                  : "border-transparent text-white/45 hover:bg-white/[0.04] hover:text-white/75",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
