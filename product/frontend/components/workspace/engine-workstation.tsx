"use client";

import { useMemo } from "react";

import { InvestigationEngineHeader } from "@/components/workspace/analyst/analyst-panel-header";
import { EngineTraceLive } from "@/components/workspace/engine-trace-live";
import type { EngineTraceEvent } from "@/lib/engine-trace";
import { cn } from "@/lib/utils";

const BG = "#141414";

/** Correct VAYNE banner — no leading C glyph. */
const BANNER = `██╗   ██╗ █████╗ ██╗   ██╗███╗   ██╗███████╗
██║   ██║██╔══██╗╚██╗ ██╔╝████╗  ██║██╔════╝
██║   ██║███████║ ╚████╔╝ ██╔██╗ ██║█████╗  
╚██╗ ██╔╝██╔══██║  ╚██╔╝  ██║╚██╗██║██╔══╝  
 ╚████╔╝ ██║  ██║   ██║   ██║ ╚████║███████╗
  ╚═══╝  ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═══╝╚══════╝`;

type PhaseState = {
  phase: string;
  progressPct: number;
  filesIngested: number;
  filesProcessed: number;
  elapsedS: number | null;
  status: string;
  version: string;
  createdBy: string;
};

type AttentionFinding = {
  finding_id: string;
  title: string;
  host: string;
  host_count?: number;
  severity: string;
  priority: number;
  confidence: number;
  reason: string;
  cve?: string | null;
  source_file?: string | null;
  on_attack_path?: boolean;
};

function latestPhase(events: EngineTraceEvent[]): PhaseState {
  let state: PhaseState = {
    phase: "Boot",
    progressPct: 0,
    filesIngested: 0,
    filesProcessed: 0,
    elapsedS: null,
    status: "idle",
    version: "0.2.0",
    createdBy: "Shaurya",
  };
  for (const ev of events) {
    if (ev.event !== "phase" || !ev.fields) continue;
    const f = ev.fields;
    state = {
      phase: String(f.phase || state.phase),
      progressPct: Number(f.progress_pct ?? state.progressPct),
      filesIngested: Number(f.files_ingested ?? state.filesIngested),
      filesProcessed: Number(f.files_processed ?? state.filesProcessed),
      elapsedS: f.elapsed_s != null ? Number(f.elapsed_s) : state.elapsedS,
      status: String(f.status || state.status),
      version: String(f.version || state.version),
      createdBy: String(f.created_by || state.createdBy),
    };
  }
  return state;
}

function attentionFindings(events: EngineTraceEvent[]): AttentionFinding[] {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.event === "attention" && Array.isArray(ev.fields?.findings)) {
      return (ev.fields.findings as AttentionFinding[]).slice(0, 6);
    }
  }
  return [];
}

function ProgressBar({ pct, phase }: { pct: number; phase: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const filled = Math.round((clamped / 100) * 28);
  const bar = "█".repeat(filled) + "░".repeat(28 - filled);
  return (
    <div className="py-1 font-mono text-[12px] text-white/75">
      <p className="tracking-wide text-white/90">{bar}</p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="tabular-nums text-white">{clamped}%</span>
        <span className="text-white/50">{phase}</span>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-white/[0.06] py-1.5">
      <span className="text-white/45">{label}</span>
      <span className="tabular-nums text-white/85">{value}</span>
    </div>
  );
}

function PriorityCard({
  finding,
  onOpen,
}: {
  finding: AttentionFinding;
  onOpen?: () => void;
}) {
  const confLabel =
    finding.confidence > 0 ? `${Math.round(finding.confidence)}%` : "unscored";
  const hostLabel =
    finding.host_count && finding.host_count > 1
      ? `${finding.host} (+${finding.host_count - 1} more)`
      : finding.host || "—";

  return (
    <article className="border border-white/[0.1] bg-white/[0.02] px-4 py-3 font-mono text-[12px]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-white/45">
          {finding.severity || "FINDING"}
          {finding.on_attack_path ? " · PATH" : ""}
        </p>
        <p className="tabular-nums text-white/55">P {formatPriority(finding.priority)}</p>
      </div>
      <p className="mt-2 text-[13px] text-white">{finding.title}</p>
      <div className="mt-3 space-y-1 text-white/55">
        <div className="flex justify-between gap-3">
          <span>Confidence</span>
          <span className="tabular-nums text-white/85">{confLabel}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Affected Host</span>
          <span className="text-right text-white/85">{hostLabel}</span>
        </div>
        {finding.source_file ? (
          <div className="flex justify-between gap-3">
            <span>Source File</span>
            <span className="max-w-[60%] truncate text-right text-white/85" title={finding.source_file}>
              {finding.source_file}
            </span>
          </div>
        ) : null}
        <div className="pt-1">
          <p className="text-white/40">Reason</p>
          <p className="mt-0.5 text-white/70">{finding.reason}</p>
        </div>
      </div>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="mt-3 text-left text-white/70 transition-colors hover:text-white"
        >
          Open Investigation →
        </button>
      ) : null}
    </article>
  );
}

function formatPriority(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function EngineWorkstation({
  events,
  running,
  onViewFullReport,
  className,
}: {
  events: EngineTraceEvent[];
  running?: boolean;
  onViewFullReport?: () => void;
  className?: string;
}) {
  const phase = useMemo(() => latestPhase(events), [events]);
  const findings = useMemo(() => attentionFindings(events), [events]);
  const statusLabel = running
    ? phase.status === "complete"
      ? "Complete"
      : "Running"
    : phase.progressPct >= 100
      ? "Complete"
      : events.length
        ? "Complete"
        : "Idle";

  return (
    <section className={cn("flex h-full min-h-0 w-full flex-col", className)} style={{ backgroundColor: BG }}>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Center: Engine Status Dashboard */}
        <div className="flex min-h-0 flex-1 flex-col bg-[#141414]">
          <InvestigationEngineHeader />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
          <div className="bg-[#141414] py-1 font-mono text-[11px] leading-[1.35] text-white/80 sm:text-[12px]">
            <pre className="overflow-x-auto whitespace-pre text-white/90">{BANNER}</pre>
            <div className="mt-4 pt-3">
              <p className="mb-2 text-white/90">Deterministic Investigation Engine</p>
              <MetaRow label="Version" value={phase.version} />
              <MetaRow label="Created By" value={phase.createdBy} />
              <MetaRow label="Current Phase" value={phase.phase} />
              <MetaRow label="Files Ingested" value={String(phase.filesIngested)} />
              <MetaRow
                label="Files Processed"
                value={`${phase.filesProcessed} / ${phase.filesIngested || phase.filesProcessed}`}
              />
              <MetaRow label="Engine Status" value={statusLabel} />
              <MetaRow
                label="Execution Time"
                value={phase.elapsedS != null ? `${phase.elapsedS.toFixed(2)} s` : "—"}
              />
            </div>
          </div>

          <div className="mt-4">
            <ProgressBar pct={phase.progressPct} phase={phase.phase} />
          </div>

          <div className="mt-auto pt-8 pb-1">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">
              Priority findings
            </p>
            {findings.length === 0 ? (
              <p className="font-mono text-[12px] text-white/35">
                {running
                  ? "Awaiting priority engine…"
                  : "No priority findings emitted for this run"}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {findings.map((finding) => (
                  <PriorityCard
                    key={finding.finding_id}
                    finding={finding}
                    onOpen={onViewFullReport}
                  />
                ))}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Right-center: ENGINE TRACE */}
        <div className="flex h-[42vh] min-h-0 shrink-0 flex-col border-t border-white/[0.08] lg:h-auto lg:w-[360px] lg:self-stretch lg:border-t-0 xl:w-[400px]">
          <EngineTraceLive events={events} running={running} className="h-full min-h-0 flex-1" />
        </div>
      </div>

      {!running && onViewFullReport ? (
        <div className="flex shrink-0 justify-end border-t border-white/[0.08] px-4 py-2">
          <button
            type="button"
            onClick={onViewFullReport}
            className="font-mono text-[13px] text-white/70 hover:text-white"
          >
            View full report
          </button>
        </div>
      ) : null}
    </section>
  );
}
