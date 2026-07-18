"use client";

import { X } from "lucide-react";

import { VaneMark } from "@/components/brand/vane-logo";

export function AnalystPanelHeader({
  contextLabel,
  onDismiss,
}: {
  contextLabel: string;
  onDismiss?: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-vx-border px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5">
        <VaneMark size={14} className="shrink-0 text-white/55" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] text-vx-body">{contextLabel}</span>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="flex size-6 shrink-0 items-center justify-center rounded text-vx-muted transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label="Clear analyst conversation"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </header>
  );
}
