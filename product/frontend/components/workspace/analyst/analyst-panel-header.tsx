"use client";

import {
  History,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Plus,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

function HeaderIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-white/55 transition-colors",
        onClick && !disabled
          ? "hover:bg-white/[0.08] hover:text-white"
          : "cursor-default opacity-40",
      )}
    >
      {children}
    </button>
  );
}

export function AnalystPanelHeader({
  contextLabel,
  onDismiss,
  onClose,
  onNewChat,
}: {
  contextLabel?: string;
  onDismiss?: () => void;
  /** Close the mobile analyst overlay (not clear chat). */
  onClose?: () => void;
  onNewChat?: () => void;
}) {
  const title = contextLabel?.trim() || "Ask VAYNE";
  const startNew = onNewChat || onDismiss;

  return (
    <header className="shrink-0 border-b border-vx-border px-2 py-1.5">
      <div className="flex items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1">
          <MessageSquare className="size-3.5 shrink-0 text-white/55" strokeWidth={1.75} aria-hidden />
          <p className="min-w-0 truncate text-[13px] font-medium text-white/90">{title}</p>
          {onDismiss || onClose ? (
            <button
              type="button"
              onClick={onDismiss || onClose}
              className="flex size-5 shrink-0 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
              aria-label={onDismiss ? "Clear chat" : "Close"}
              title={onDismiss ? "Clear chat" : "Close"}
            >
              <X className="size-3" strokeWidth={2} />
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <HeaderIconButton label="New chat" onClick={startNew}>
            <Plus className="size-3.5" strokeWidth={1.75} />
          </HeaderIconButton>
          <HeaderIconButton label="History">
            <History className="size-3.5" strokeWidth={1.75} />
          </HeaderIconButton>
          <HeaderIconButton label="More">
            <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
          </HeaderIconButton>
          <HeaderIconButton label="Toggle panel" onClick={onClose}>
            <PanelRight className="size-3.5" strokeWidth={1.75} />
          </HeaderIconButton>
        </div>
      </div>
    </header>
  );
}
