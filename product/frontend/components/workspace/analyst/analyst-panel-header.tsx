"use client";

import type { LucideIcon } from "lucide-react";
import {
  Cpu,
  History,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Plus,
  Terminal,
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

/**
 * Cursor-style tab chrome: active title tab merges into the panel body
 * (no bottom border under the tab); actions sit on the bordered strip.
 */
export function WorkspacePanelHeader({
  icon: Icon,
  title,
  onClose,
  onPrimaryAction,
  primaryActionLabel = "New",
}: {
  icon: LucideIcon;
  title: string;
  onClose?: () => void;
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
}) {
  return (
    <header className="flex shrink-0 items-stretch bg-[#0e0e0e]">
      {/* Active tab — same surface as panel body, open bottom edge */}
      <div className="flex min-w-0 max-w-[min(100%,280px)] items-center gap-1.5 border-r border-vx-border bg-[#141414] px-3 py-2">
        <Icon className="size-3.5 shrink-0 text-white/55" strokeWidth={1.75} aria-hidden />
        <p className="min-w-0 truncate text-[13px] font-medium text-white/90">{title}</p>
      </div>

      {/* Tab-bar remainder — keeps the bottom rule; tab merges past it */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-0.5 border-b border-vx-border px-2 py-1.5">
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
    </header>
  );
}

export function AnalystPanelHeader({
  contextLabel,
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
      onClose={onClose}
      onPrimaryAction={onNewChat}
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
      onClose={onClose}
      onPrimaryAction={onClear}
      primaryActionLabel="Clear trace"
    />
  );
}

export function InvestigationEngineHeader({ onClose }: { onClose?: () => void } = {}) {
  return (
    <WorkspacePanelHeader
      icon={Cpu}
      title="Investigation Engine"
      onClose={onClose}
    />
  );
}
