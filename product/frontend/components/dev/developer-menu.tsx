"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

import { resetVayneWorkspaceAndReload } from "@/lib/reset-vayne-workspace";
import { cn } from "@/lib/utils";

const DEV_ENABLED = process.env.NODE_ENV === "development";

export function DeveloperMenu({
  className,
  placement = "above",
}: {
  className?: string;
  placement?: "above" | "below";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!DEV_ENABLED) return null;

  const handleReset = async () => {
    const confirmed = window.confirm(
      "This will permanently delete all local VAYNE investigations and reset the workspace.",
    );
    if (!confirmed) return;

    setBusy(true);
    setOpen(false);
    try {
      await resetVayneWorkspaceAndReload();
    } catch (error) {
      setBusy(false);
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`Workspace reset failed: ${message}`);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label="Developer menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex size-8 items-center justify-center rounded-md text-vx-secondary transition-colors hover:bg-vx-panel hover:text-white",
          busy && "opacity-40",
        )}
      >
        <MoreHorizontal className="size-4" strokeWidth={2} />
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute right-0 z-50 min-w-[200px] rounded-lg border border-vx-border bg-vx-panel py-1 shadow-none",
            placement === "above" ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          <p className="px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">
            Developer
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleReset()}
            className="block w-full px-3 py-2 text-left text-[13px] text-white/75 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            Reset VAYNE Workspace
          </button>
        </div>
      ) : null}
    </div>
  );
}
