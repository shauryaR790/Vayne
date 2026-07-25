"use client";

import type { LucideIcon } from "lucide-react";
import {
  History,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Plus,
  Terminal,
  X,
} from "lucide-react";

import { ANALYST_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

function HeaderIconButton({
  label,
  onClick,
  muted,
  children,
}: {
  label: string;
  onClick?: () => void;
  /** Keep chrome visible even when the action is not wired yet. */
  muted?: boolean;
  children: React.ReactNode;
}) {
  const interactive = Boolean(onClick) && !muted;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-white/55 transition-colors",
        interactive
          ? "hover:bg-white/[0.08] hover:text-white"
          : "cursor-default text-white/45",
      )}
    >
      {children}
    </button>
  );
}

/** Shared Cursor-style tab chrome for side panels (Analyst + Engine Trace). */
export function WorkspacePanelHeader({
  icon: Icon,
  title,
  onDismiss,
  onClose,
  onPrimaryAction,
  primaryActionLabel = "New",
}: {
  icon: LucideIcon;
  title: string;
  onDismiss?: () => void;
  onClose?: () => void;
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
}) {
  return (
    <header className="shrink-0 border-b border-vx-border px-2 py-1.5">
      <div className="flex items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1">
          <Icon className="size-3.5 shrink-0 text-white/55" strokeWidth={1.75} aria-hidden />
          <p className="min-w-0 truncate text-[13px] font-medium text-white/90">{title}</p>
          {onDismiss || onClose ? (
            <button
              type="button"
              onClick={onDismiss || onClose}
              className="flex size-5 shrink-0 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
              aria-label={onDismiss ? "Dismiss" : "Close"}
              title={onDismiss ? "Dismiss" : "Close"}
            >
              <X className="size-3" strokeWidth={2} />
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <HeaderIconButton label={primaryActionLabel} onClick={onPrimaryAction} muted={!onPrimaryAction}>
            <Plus className="size-3.5" strokeWidth={1.75} />
          </HeaderIconButton>
          <HeaderIconButton label="History" muted>
            <History className="size-3.5" strokeWidth={1.75} />
          </HeaderIconButton>
          <HeaderIconButton label="More" muted>
            <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
          </HeaderIconButton>
          <HeaderIconButton label="Toggle panel" onClick={onClose} muted={!onClose}>
            <PanelRight className="size-3.5" strokeWidth={1.75} />
          </HeaderIconButton>
        </div>
      </div>
    </header>
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
  onClose?: () => void;
  onNewChat?: () => void;
}) {
  return (
    <WorkspacePanelHeader
      icon={MessageSquare}
      title={contextLabel?.trim() || ANALYST_NAME}
      onDismiss={onDismiss}
      onClose={onClose}
      onPrimaryAction={onNewChat || onDismiss}
      primaryActionLabel="New chat"
    />
  );
}

export function EngineTraceHeader({
  onClear,
  onClose,
}: {
  onClear?: () => void;
  onClose?: () => void;
} = {}) {
  return (
    <WorkspacePanelHeader
      icon={Terminal}
      title="Engine Trace"
      onDismiss={onClear}
      onClose={onClose}
      onPrimaryAction={onClear}
      primaryActionLabel="Clear trace"
    />
  );
}
