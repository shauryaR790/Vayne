"use client";

import { MessageSquare, X } from "lucide-react";

import { ANALYST_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function AnalystPanelHeader({
  tabLabel,
  onDismiss,
}: {
  tabLabel?: string;
  onDismiss?: () => void;
}) {
  const label = tabLabel?.trim() || ANALYST_NAME;

  return (
    <header className="shrink-0 border-b border-vx-border bg-vx-analyst px-3 py-2">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-md border border-white/12 bg-vx-panel px-2.5 py-1.5",
          )}
        >
          <MessageSquare
            className="size-3.5 shrink-0 text-white/55"
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="min-w-0 truncate text-[13px] text-white/90">{label}</span>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="ml-auto flex size-5 shrink-0 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
              aria-label="Clear analyst conversation"
            >
              <X className="size-3" strokeWidth={2} />
            </button>
          ) : (
            <span className="ml-auto size-5 shrink-0" aria-hidden />
          )}
        </div>
      </div>
    </header>
  );
}
