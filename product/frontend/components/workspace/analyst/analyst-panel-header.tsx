"use client";

import { X } from "lucide-react";

export function AnalystPanelHeader({
  onDismiss,
}: {
  contextLabel?: string;
  onDismiss?: () => void;
}) {
  if (!onDismiss) return null;

  return (
    <header className="shrink-0 border-b border-vx-border px-4 py-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onDismiss}
          className="flex size-7 shrink-0 items-center justify-center rounded text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white"
          aria-label="Clear analyst conversation"
        >
          <X className="size-3.5" strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
