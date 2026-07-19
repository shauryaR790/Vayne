"use client";

import { useState } from "react";

import { InvestigationInlineReport } from "@/components/conversation/investigation-inline-report";
import { shortFilename } from "@/lib/evidence-presentation";
import { cn } from "@/lib/utils";

export function InvestigationSourceTabs({
  investigations,
  defaultIndex = 0,
}: {
  investigations: Array<{ id: string; sourceLabel?: string }>;
  defaultIndex?: number;
}) {
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
  const active = investigations[activeIndex] ?? investigations[0];

  if (!investigations.length) return null;

  if (investigations.length === 1) {
    return (
      <InvestigationInlineReport
        investigationId={investigations[0].id}
        sourceLabel={investigations[0].sourceLabel}
      />
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col">
      <div className="sticky top-[49px] z-[9] border-b border-vx-border bg-vx-section-body/95 backdrop-blur-sm">
        <div
          className="flex gap-1 overflow-x-auto px-4 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Evidence analyses"
        >
          {investigations.map((inv, index) => {
            const label = inv.sourceLabel
              ? shortFilename(inv.sourceLabel)
              : `Scan ${index + 1}`;
            const selected = index === activeIndex;
            return (
              <button
                key={inv.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveIndex(index)}
                className={cn(
                  "shrink-0 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors",
                  selected
                    ? "border-white/25 bg-white text-black"
                    : "border-transparent text-vx-muted hover:border-white/10 hover:bg-white/[0.04] hover:text-white",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {active ? (
        <InvestigationInlineReport
          key={active.id}
          investigationId={active.id}
          sourceLabel={active.sourceLabel}
          sequenceIndex={activeIndex + 1}
        />
      ) : null}
    </div>
  );
}
