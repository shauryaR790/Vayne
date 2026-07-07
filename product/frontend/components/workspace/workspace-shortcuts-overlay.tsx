"use client";

import { useEffect } from "react";

import {
  SUPPORTED_FORMATS,
  WORKSPACE_SHORTCUTS,
} from "@/lib/workspace-shortcuts";

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
  return <ShortcutTable className={className} />;
}

export function WorkspaceSupportedFormats({ className }: { className?: string }) {
  return (
    <p className={className}>
      <span className="text-[12px] text-vx-muted">Supports </span>
      <span className="text-[12px] text-vx-secondary">{SUPPORTED_FORMATS.join(" · ")}</span>
    </p>
  );
}
