"use client";

import type { DragEvent } from "react";
import { useCallback, useState } from "react";

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
      <header className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-4 py-2">
        <p className="text-[13px] text-white/70">Investigation Engine</p>
        <p className="text-[12px] tabular-nums text-white/55">IDLE · AWAITING ARTIFACTS</p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Center: Engine Status Dashboard (preview) */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="border border-white/[0.1] bg-[#141414] px-4 py-4 text-[11px] leading-[1.35] text-white/80 sm:text-[12px]">
            <pre className="overflow-x-auto whitespace-pre text-white/90">{BANNER}</pre>
            <div className="mt-4 border-t border-white/[0.08] pt-3">
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

          <div className="mt-4 border border-white/[0.1] px-4 py-3 text-[12px] text-white/75">
            <p className="tracking-wide text-white/35">
              ░░░░░░░░░░░░░░░░░░░░░░░░░░░░
            </p>
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <span className="tabular-nums text-white/50">0%</span>
              <span className="text-white/40">Awaiting artifacts</span>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-white/40">
              After ingest, this bar advances only when real stages complete — Parser, Correlation,
              Confidence, Attack Graph, Priority.
            </p>
          </div>

          <div className="mt-6">
            <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-white/45">
              Priority findings
            </p>
            <div className="border border-dashed border-white/[0.12] px-4 py-8 text-[12px] leading-relaxed text-white/40">
              <p className="text-white/60">Empty until the run finishes.</p>
              <p className="mt-3">
                After completion you will see up to six cards here — ranked by engine priority, not
                severity labels alone. Each card shows confidence, host, source file, and why it
                needs attention, with Open Investigation → into the full report.
              </p>
            </div>
          </div>
        </div>

        {/* Right-center: ENGINE TRACE (preview terminal) */}
        <div className="h-[42vh] shrink-0 border-t border-white/[0.08] lg:h-auto lg:w-[360px] lg:border-t-0 xl:w-[400px]">
          <aside className="flex h-full min-h-0 w-full flex-col border-l border-white/[0.08] bg-[#141414]">
            <header className="shrink-0 border-b border-white/[0.08] px-4 py-3">
              <p className="text-[12px] uppercase tracking-[0.14em] text-white/75">Engine Trace</p>
              <p className="mt-1 text-[11px] text-white/35">
                Live CLI proof + formulas as evaluated
              </p>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[11.5px] leading-[1.55] text-white/65">
              <p className="tracking-[0.12em] text-white/85">[STANDBY]</p>
              <p className="mt-2 text-white/45">No artifacts loaded — trace idle.</p>

              <div className="mt-5 border-t border-white/[0.08] pt-5">
                <p className="tracking-[0.12em] text-white/85">[WHAT YOU WILL SEE]</p>
                <p className="mt-2">↓</p>
                <p className="mt-1">Parser — files detected, findings extracted, execution ms</p>
                <p className="mt-1">↓</p>
                <p className="mt-1">Correlation — merges, scanner agreement, CVE matches</p>
                <p className="mt-1">↓</p>
                <p className="mt-1">finding_confidence() — Observation × 0.34 · Reliability × 0.24 · Exploit × 0.24 · Impact × 0.18</p>
                <p className="mt-1">↓</p>
                <p className="mt-1">priority_score() — weighted quality dimensions → priority</p>
                <p className="mt-1">↓</p>
                <p className="mt-1">Attack Graph — nodes, edges, traversal, surviving paths</p>
                <p className="mt-1">↓</p>
                <p className="mt-1">Proof Mode — NODE / EDGE / PATH dump (exact CLI stream)</p>
              </div>

              <div className="mt-5 border-t border-white/[0.08] pt-5">
                <p className="tracking-[0.12em] text-white/85">[FORMULAS]</p>
                <p className="mt-2 text-white/45">Documented permanently in Engine Documentation.</p>
                <p className="mt-2">Live evaluations appear here only while the engine runs.</p>
                <p className="mt-2">Inactive formulas are never shown.</p>
              </div>

              <div className="mt-5 border-t border-white/[0.08] pt-5">
                <p className="tracking-[0.12em] text-white/85">[EXPECT AFTER RUN]</p>
                <p className="mt-2">Streaming stage blocks + continuous proof telemetry.</p>
                <p className="mt-1">Priority cards fill on the left when attention findings emit.</p>
                <p className="mt-1">Analyst panel explains results only after the engine completes.</p>
              </div>

              <span className="mt-4 inline-block text-white/35">▌</span>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
