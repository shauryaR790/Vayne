"use client";

import type { DragEvent } from "react";
import { useCallback, useState } from "react";

import type { InvestigationMode } from "@/lib/investigation-mode";
import { cn } from "@/lib/utils";

const ARTIFACT_TYPES = [
  "Nmap XML",
  "Nessus",
  "Nuclei",
  "Burp",
  "BloodHound",
  "OpenVAS",
  "Httpx",
  "Naabu",
];

export function EngineInputPanel({
  disabled,
  busy,
  stagedFiles = [],
  investigationMode = "combined",
  onInvestigationModeChange,
  onSelectFiles,
  onRemoveFile,
  onClearFiles,
  onBeginSession,
  onUpload,
  onUploadFolder,
}: {
  disabled?: boolean;
  busy?: boolean;
  stagedFiles?: File[];
  investigationMode?: InvestigationMode;
  onInvestigationModeChange?: (mode: InvestigationMode) => void;
  onSelectFiles: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  onClearFiles?: () => void;
  onBeginSession: (prompt: string) => void;
  onUpload: () => void;
  onUploadFolder?: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const count = stagedFiles.length;
  const ready = count > 0 && !disabled && !busy;

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const picked = Array.from(e.dataTransfer.files ?? []);
      if (picked.length) onSelectFiles(picked);
    },
    [disabled, onSelectFiles],
  );

  return (
    <div className="mx-auto w-full max-w-[640px] font-mono text-[13px] text-white/75">
      <div className="border border-white/[0.12] bg-[#141414] px-5 py-5 sm:px-7 sm:py-7">
        <p className="tracking-[0.16em] text-white/45">ENGINE INPUT</p>
        <h2 className="mt-3 text-[18px] font-medium tracking-[-0.01em] text-white">
          Drop Scanner Artifacts
        </h2>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-white/40">
          {ARTIFACT_TYPES.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>

        <div
          className={cn(
            "mt-6 border border-dashed px-4 py-10 text-center transition-colors",
            dragOver ? "border-white/40 bg-white/[0.04]" : "border-white/15",
            disabled && "opacity-50",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <p className="text-white/70">Drag Files Here</p>
          <p className="mt-2 text-white/35">or</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              disabled={disabled}
              onClick={onUpload}
              className="border border-white/20 px-4 py-2 text-white/80 hover:border-white/40 hover:text-white"
            >
              Browse Artifacts
            </button>
            {onUploadFolder ? (
              <button
                type="button"
                disabled={disabled}
                onClick={onUploadFolder}
                className="border border-white/10 px-4 py-2 text-white/50 hover:border-white/25 hover:text-white/80"
              >
                Browse Folder
              </button>
            ) : null}
          </div>
        </div>

        {count > 0 ? (
          <div className="mt-6 border-t border-white/[0.08] pt-5">
            <p className="text-white">Artifacts Loaded</p>
            <p className="mt-1 tabular-nums text-white/55">{count} files</p>
            <p className="mt-1 text-white/40">Ready</p>

            <ul className="mt-4 max-h-40 space-y-1 overflow-y-auto text-[12px] text-white/45">
              {stagedFiles.slice(0, 40).map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3">
                  <span className="truncate">{file.name}</span>
                  {onRemoveFile ? (
                    <button
                      type="button"
                      className="shrink-0 text-white/30 hover:text-white/70"
                      onClick={() => onRemoveFile(index)}
                    >
                      remove
                    </button>
                  ) : null}
                </li>
              ))}
              {count > 40 ? <li className="text-white/30">+{count - 40} more</li> : null}
            </ul>

            {onClearFiles ? (
              <button
                type="button"
                onClick={onClearFiles}
                className="mt-3 text-[12px] text-white/35 hover:text-white/60"
              >
                Clear artifacts
              </button>
            ) : null}

            {onInvestigationModeChange && count > 1 ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.08] pt-4">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onInvestigationModeChange("combined")}
                  className={cn(
                    "border px-3 py-1.5 text-[12px]",
                    investigationMode === "combined"
                      ? "border-white/30 text-white"
                      : "border-white/10 text-white/45",
                  )}
                >
                  Merge scans
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onInvestigationModeChange("separate")}
                  className={cn(
                    "border px-3 py-1.5 text-[12px]",
                    investigationMode === "separate"
                      ? "border-white/30 text-white"
                      : "border-white/10 text-white/45",
                  )}
                >
                  Analyze separately
                </button>
              </div>
            ) : null}

            <button
              type="button"
              disabled={!ready}
              onClick={() => onBeginSession("")}
              className={cn(
                "mt-5 w-full border px-4 py-3 tracking-[0.08em]",
                ready
                  ? "border-white/35 bg-white text-black hover:bg-white/90"
                  : "border-white/10 text-white/30",
              )}
            >
              {busy ? "RUNNING…" : "Run Investigation"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
