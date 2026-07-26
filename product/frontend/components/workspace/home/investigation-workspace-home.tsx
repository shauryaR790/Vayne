"use client";

import type { DragEvent } from "react";
import { useCallback, useState } from "react";

import { InvestigationEngineHeader } from "@/components/workspace/analyst/analyst-panel-header";
import { VayneAsciiTitle } from "@/components/brand/vayne-ascii-title";
import { panelDragMime } from "@/lib/workspace-panel-order";
import { cn } from "@/lib/utils";

const BG = "#141414";

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-white/[0.06] py-1.5">
      <span className="text-white/45">{label}</span>
      <span className="tabular-nums text-white/85">{value}</span>
    </div>
  );
}

function isPanelReorderDrag(e: DragEvent): boolean {
  return [...e.dataTransfer.types].includes(panelDragMime());
}

/**
 * Pre-run Investigation Engine shell — same layout as post-run, with
 * formula/expectancy copy instead of live telemetry.
 * Engine Trace lives in the shared swappable dock (sibling panel).
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
      if (isPanelReorderDrag(e)) return;
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
        if (isPanelReorderDrag(e)) return;
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="flex min-h-0 flex-1 flex-col bg-[#141414]">
        <InvestigationEngineHeader />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
          <div className="shrink-0 py-1">
            <VayneAsciiTitle />
          </div>

          <div className="mt-auto flex flex-col pt-10">
            <div className="py-1 text-[11px] leading-[1.35] text-white/80 sm:text-[12px]">
              <p className="mb-2 text-white/90">Deterministic Investigation Engine</p>
              <MetaRow label="Version" value="0.2.0" />
              <MetaRow label="Created By" value="Nemzyi" />
              <MetaRow label="Current Phase" value="Idle — ingest to start" />
              <MetaRow label="Files Ingested" value="0" />
              <MetaRow label="Files Processed" value="0 / 0" />
              <MetaRow label="Engine Status" value="Idle" />
              <MetaRow label="Execution Time" value="—" />

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

            <div className="mt-6 py-1 text-[12px] text-white/75">
              <p className="tracking-wide text-white/35">
                ░░░░░░░░░░░░░░░░░░░░░░░░░░░░
              </p>
              <div className="mt-2">
                <span className="tabular-nums text-white/50">0%</span>
              </div>
            </div>

            <div className="pt-8 pb-1">
              <p className="mb-3 font-sans text-[11px] uppercase tracking-[0.14em] text-white/45">
                Priority findings
              </p>
              <div className="py-2 font-sans text-[14px] leading-relaxed text-vx-muted">
                <p>Empty until the run finishes.</p>
                <p className="mt-3">
                  After completion you will see up to six cards here — ranked by engine priority, not
                  severity labels alone. Each card shows confidence, host, source file, and why it
                  needs attention, with Open Investigation → into the full report.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
