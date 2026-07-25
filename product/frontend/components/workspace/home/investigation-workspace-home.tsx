"use client";

import type { DragEvent } from "react";
import { useCallback, useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Empty investigation home — OG 2000s VAYNE mark + file/folder ingest only.
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
      className={cn(
        "relative flex h-full min-h-0 w-full flex-col items-center justify-center overflow-hidden bg-black",
        "font-mono",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {/* Subtle CRT / scanline atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,255,0.15) 3px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,255,255,0.06) 0%, transparent 55%), radial-gradient(ellipse at 70% 40%, rgba(255,0,200,0.05) 0%, transparent 50%)",
        }}
      />

      <div className="relative z-[1] flex w-full max-w-[560px] flex-col items-center px-6">
        <Image
          src="/vayne-logo-og.png"
          alt="VAYNE"
          width={520}
          height={140}
          priority
          className="h-auto w-full max-w-[420px] select-none object-contain sm:max-w-[480px]"
        />

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
              "border-2 px-6 py-3 text-[13px] uppercase tracking-[0.18em] transition-colors",
              "border-cyan-400/70 text-cyan-200",
              "shadow-[3px_3px_0_0_rgba(255,0,200,0.55),-2px_-2px_0_0_rgba(255,220,0,0.35)]",
              "hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-white",
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
                "border-2 px-6 py-3 text-[13px] uppercase tracking-[0.18em] transition-colors",
                "border-fuchsia-400/70 text-fuchsia-200",
                "shadow-[3px_3px_0_0_rgba(0,255,255,0.45),-2px_-2px_0_0_rgba(255,220,0,0.35)]",
                "hover:border-fuchsia-300 hover:bg-fuchsia-400/10 hover:text-white",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              Ingest Folder
            </button>
          ) : null}
        </div>

        {dragOver ? (
          <p className="mt-5 text-[12px] tracking-[0.14em] text-yellow-300/80">
            DROP ARTIFACTS
          </p>
        ) : (
          <p className="mt-5 text-center text-[11px] tracking-[0.12em] text-white/30">
            Nmap · Nessus · Nuclei · Burp · BloodHound · OpenVAS
          </p>
        )}
      </div>
    </div>
  );
}
