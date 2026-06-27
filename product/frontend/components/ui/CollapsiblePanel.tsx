"use client";

import { useState, type ReactNode } from "react";

export function CollapsiblePanel({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="vx-panel border border-vercel-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-vercel-hover transition-[background-color] duration-150"
      >
        <span className="text-body font-medium text-white">{title}</span>
        <span className="flex items-center gap-2">
          {badge && <span className="vx-badge-neutral">{badge}</span>}
          <span className="text-vercel-muted text-label">{open ? "−" : "+"}</span>
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-vercel-border">{children}</div>
      )}
    </div>
  );
}
