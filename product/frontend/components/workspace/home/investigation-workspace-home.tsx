"use client";

import type { DragEvent } from "react";
import { useCallback, useState } from "react";

import { EngineTraceHeader, InvestigationEngineHeader } from "@/components/workspace/analyst/analyst-panel-header";
import { EngineTraceStandby } from "@/components/workspace/engine-trace-standby";
import { cn } from "@/lib/utils";

const BG = "#141414";

/** Same ASCII mark as the live Investigation Engine workstation. */
const BANNER = `██╗   ██╗ █████╗ ██╗   ██╗███╗   ██╗███████╗
██║   ██║██╔══██╗╚██╗ ██╔╝████╗  ██║██╔════╝
██║   ██║███████║ ╚████╔╝ ██╔██╗ ██║█████╗  
╚██╗ ██╔╝██╔══██║  ╚██╔╝  ██║╚██╗██║██╔══╝  
 ╚████╔╝ ██║  ██║   ██║   ██║ ╚████║███████╗
  ╚═══╝  ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═══╝╚══════╝`;

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-white/[0.06] py-1.5">
      <span className="text-white/45">{label}</span>
      <span className="tabular-nums text-white/85">{value}</span>
    </div>
  );
}

/**
 * Pre-run Investigation Engine shell — same layout as post-run, with
 * formula/expectancy copy instead of live telemetry.
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
    <section
      className="flex h-full min-h-0 w-full flex-col font-mono"
      style={{ backgroundColor: BG }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Center: Engine Status Dashboard (preview) */}
        <div className="flex min-h-0 flex-1 flex-col bg-[#141414]">
          <InvestigationEngineHeader />
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="bg-[#141414] py-1 text-[11px] leading-[1.35] text-white/80 sm:text-[12px]">
            <pre className="overflow-x-auto whitespace-pre text-white/90">{BANNER}</pre>
            <div className="mt-4 pt-3">
              <p className="mb-2 text-white/90">Deterministic Investigation Engine</p>
              <MetaRow label="Version" value="0.2.0" />
              <MetaRow label="Created By" value="Shaurya" />
              <MetaRow label="Current Phase" value="Idle — ingest to start" />
              <MetaRow label="Files Ingested" value="0" />
              <MetaRow label="Files Processed" value="0 / 0" />
              <MetaRow label="Engine Status" value="Idle" />
              <MetaRow label="Execution Time" value="—" />
            </div>

            <div
              className={cn(
                "mt-5 flex flex-col gap-2 sm:flex-row",
                dragOver && "opacity-90",
              )}
            >
              <button
                type="button"
                disabled={disabled || busy}
                onClick={onUpload}
                className={cn(
                  "border border-white/20 px-4 py-2.5 text-[12px] uppercase tracking-[0.14em] text-white/80",
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
                    "border border-white/20 px-4 py-2.5 text-[12px] uppercase tracking-[0.14em] text-white/80",
                    "transition-colors hover:border-white/40 hover:text-white",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                  )}
                >
                  Ingest Folder
                </button>
              ) : null}
            </div>
            {dragOver ? (
              <p className="mt-3 text-[12px] tracking-[0.12em] text-white/55">Drop artifacts</p>
            ) : null}
          </div>

          <div className="mt-8">
            <p className="mb-4 text-[11px] uppercase tracking-[0.14em] text-white/45">
              Priority findings
            </p>
            <div className="flex min-h-[120px] items-center justify-center px-2 text-center">
              <p className="max-w-[280px] font-sans text-[14px] leading-relaxed text-vx-muted">
                Empty until the run finishes.
              </p>
            </div>
          </div>
          </div>
        </div>

        {/* Right-center: ENGINE TRACE (idle terminal) */}
        <div className="flex h-[42vh] min-h-0 shrink-0 flex-col border-t border-white/[0.08] lg:h-auto lg:w-[360px] lg:self-stretch lg:border-t-0 xl:w-[400px]">
          <aside className="flex h-full min-h-0 w-full flex-1 flex-col border-l border-white/[0.08] bg-[#141414]">
            <EngineTraceHeader />
            <EngineTraceStandby />
          </aside>
        </div>
      </div>
    </section>
  );
}
