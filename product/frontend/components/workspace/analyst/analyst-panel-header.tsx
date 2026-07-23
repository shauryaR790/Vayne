"use client";

import { X } from "lucide-react";

export function AnalystPanelHeader({
  onDismiss,
  onClose,
}: {
  contextLabel?: string;
  onDismiss?: () => void;
  /** Close the mobile analyst overlay (not clear chat). */
  onClose?: () => void;
}) {
  if (!onDismiss && !onClose) return null;

  return (
    <header className="shrink-0 border-b border-vx-border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        {onClose ? (
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
            Ask VAYNE
          </p>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 items-center gap-1">
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="flex size-7 shrink-0 items-center justify-center rounded text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="Clear analyst conversation"
            >
              <X className="size-3.5" strokeWidth={2} />
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-white transition-colors hover:bg-white/10"
              aria-label="Close Ask VAYNE"
            >
              <X className="size-4" strokeWidth={2} />
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
