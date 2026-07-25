"use client";

import type { DragEvent } from "react";
import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";

/** Same ASCII mark as the Investigation Engine workstation — not an image. */
const BANNER = `██╗   ██╗ █████╗ ██╗   ██╗███╗   ██╗███████╗
██║   ██║██╔══██╗╚██╗ ██╔╝████╗  ██║██╔════╝
██║   ██║███████║ ╚████╔╝ ██╔██╗ ██║█████╗  
╚██╗ ██╔╝██╔══██║  ╚██╔╝  ██║╚██╗██║██╔══╝  
 ╚████╔╝ ██║  ██║   ██║   ██║ ╚████║███████╗
  ╚═══╝  ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═══╝╚══════╝`;

/**
 * Empty investigation home — ASCII VAYNE mark + file/folder ingest only.
 */
export function InvestigationWorkspaceHome({
  disabled,
  busy,
  onSelectFiles,
  onUpload,
  onUploadFolder,
}: {
  disabled?: boolean;
  busy?: boolean;
  stagedFiles?: File[];
  investigationMode?: string;
  onInvestigationModeChange?: (mode: "combined" | "separate") => void;
  onSelectFiles: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  onClearFiles?: () => void;
  onBeginSession?: (prompt: string) => void;
  onUpload: () => void;
  onUploadFolder?: () => void;
  onOpenInvestigation?: (id: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled || busy) return;
      const picked = Array.from(e.dataTransfer.files ?? []);
      if (picked.length) onSelectFiles(picked);
    },
    [busy, disabled, onSelectFiles],
  );

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col items-center justify-center bg-[#141414] font-mono"
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="flex w-full max-w-[560px] flex-col items-center px-6">
        <pre className="overflow-x-auto whitespace-pre text-center text-[10px] leading-[1.3] text-white/90 sm:text-[12px]">
          {BANNER}
        </pre>

        <p className="mt-6 text-center text-[11px] uppercase tracking-[0.28em] text-white/45">
          Deterministic Investigation Engine
        </p>

        <div
          className={cn(
            "mt-10 flex w-full flex-col items-stretch gap-3 sm:flex-row sm:justify-center",
            dragOver && "opacity-90",
          )}
        >
          <button
            type="button"
            disabled={disabled || busy}
            onClick={onUpload}
            className={cn(
              "border border-white/20 px-6 py-3 text-[13px] uppercase tracking-[0.14em] text-white/80",
              "transition-colors hover:border-white/40 hover:text-white",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            Ingest File
          </button>
          {onUploadFolder ? (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={onUploadFolder}
              className={cn(
                "border border-white/20 px-6 py-3 text-[13px] uppercase tracking-[0.14em] text-white/80",
                "transition-colors hover:border-white/40 hover:text-white",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              Ingest Folder
            </button>
          ) : null}
        </div>

        {dragOver ? (
          <p className="mt-5 text-[12px] tracking-[0.14em] text-white/60">Drop artifacts</p>
        ) : null}
      </div>
    </div>
  );
}
