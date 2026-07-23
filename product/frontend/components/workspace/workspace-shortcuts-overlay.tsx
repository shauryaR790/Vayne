"use client";

import { useEffect } from "react";
import {
  Command,
  CornerDownLeft,
  FolderOpen,
  Keyboard,
  Plus,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import {
  SUPPORTED_FORMATS,
  WORKSPACE_SHORTCUTS,
} from "@/lib/workspace-shortcuts";
import { cn } from "@/lib/utils";

const SHORTCUT_ICONS: Record<string, LucideIcon> = {
  "New Investigation": Plus,
  "Open Evidence": FolderOpen,
  "Analyze Selected Evidence": CornerDownLeft,
  "Ask VAYNE Analyst": Sparkles,
  "Command Palette": Command,
  "Keyboard Shortcuts": Keyboard,
};

function KeyCombo({ combo }: { combo: string }) {
  const keys = combo.split("+").map((k) => k.trim());
  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.map((key, i) => (
        <span key={`${key}-${i}`} className="flex items-center gap-1">
          {i > 0 ? <span className="text-[11px] text-vx-muted/60">+</span> : null}
          <kbd className="border border-white/20 bg-black px-1.5 py-0.5 font-mono text-[11px] leading-none text-vx-secondary">
            {key}
          </kbd>
        </span>
      ))}
    </span>
  );
}

/** Polished home shortcut list — icons + kbd chips inside a soft card. */
function ShortcutCard({ className }: { className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-[420px]", className)}>
      <p className="mb-2.5 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
        Shortcuts
      </p>
      <div className="border border-white/20 bg-black">
        {WORKSPACE_SHORTCUTS.map((row) => {
          const Icon = SHORTCUT_ICONS[row.action] ?? Keyboard;
          return (
            <div
              key={row.shortcut}
              className="group flex items-center gap-3 border-b border-white/10 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-white/[0.04]"
            >
              <Icon
                className="size-4 shrink-0 text-white/40 transition-colors group-hover:text-white"
                strokeWidth={2}
              />
              <span className="flex-1 text-left text-[12px] font-bold uppercase tracking-wide text-white/60 transition-colors group-hover:text-white">
                {row.action}
              </span>
              <KeyCombo combo={row.shortcut} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShortcutTable({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="mx-auto grid w-full max-w-[400px] grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-x-8 gap-y-2">
        {WORKSPACE_SHORTCUTS.map((row) => (
          <div key={row.shortcut} className="contents">
            <span className="text-left text-[13px] text-vx-secondary">{row.action}</span>
            <span className="text-right font-mono text-[13px] text-vx-muted">{row.shortcut}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkspaceShortcutsOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[480px] py-8 text-center"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        <ShortcutTable />
        <p className="mt-8 text-[12px] text-vx-muted">
          Supports {SUPPORTED_FORMATS.join(" · ")}
        </p>
        <p className="mt-6 text-[12px] text-vx-muted">Press Esc to close</p>
      </div>
    </div>
  );
}

export function WorkspaceHomeShortcuts({ className }: { className?: string }) {
  return <ShortcutCard className={className} />;
}

export function WorkspaceSupportedFormats({ className }: { className?: string }) {
  return (
    <p className={className}>
      <span className="text-[12px] text-vx-muted">Supports </span>
      <span className="text-[12px] text-vx-secondary">{SUPPORTED_FORMATS.join(" · ")}</span>
    </p>
  );
}
